import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

// ---- Helpers (mirrored from import-entries.js) ----

function normalizeName(first: string | null, last: string | null): string {
  return [first, last]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+\w\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(str: unknown): string | null {
  if (typeof str !== "string") return null;
  const out = str.replace(/[<>]/g, "");
  return out || null;
}

function normEmail(e: unknown): string | null {
  if (!e || typeof e !== "string") return null;
  const v = e.trim().toLowerCase();
  return v || null;
}

type CustomField = {
  id?: string;
  name?: string;
  optionValues?: Array<{ id?: string; name?: string }>;
  value?: string;
};

function getCustomFieldValue(
  customFields: CustomField[] | undefined,
  fieldName: string,
): string | null {
  const field = (customFields ?? []).find((f) => f.name === fieldName);
  if (!field) return null;
  if (field.optionValues && field.optionValues.length > 0) {
    return field.optionValues[0].name ?? null;
  }
  return field.value ?? null;
}

// ---- Neon payload shape (registration webhooks) ----

type NeonAttendee = {
  attendeeId: number;
  accountId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  markedAttended?: boolean;
  attendeeCustomFields?: CustomField[];
  registrantAccountId?: string;
  registrationStatus?: string;
  registrationDate?: string;
};

type NeonRegistrationPayload = {
  eventTrigger: string;
  eventTimestamp?: string;
  data?: {
    id?: string;
    eventId?: string;
    registrationDateTime?: string;
    registrantAccountId?: string;
    tickets?: Array<{
      attendees?: NeonAttendee[];
    }>;
  };
};

// ---- Person resolution (mirrored from import-entries.js) ----

type ResolveInput = {
  neon_account_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type SupabaseClient = ReturnType<typeof getServiceClient>;

async function resolvePersonId(
  supabase: SupabaseClient,
  rec: ResolveInput,
): Promise<string> {
  const accId = rec.neon_account_id ? String(rec.neon_account_id) : null;
  const email = normEmail(rec.email);
  const normName = normalizeName(rec.first_name, rec.last_name);

  // 1. neon_account_id match
  if (accId) {
    const { data: hit } = await supabase
      .from("person_identifier")
      .select("person_id")
      .eq("source", "neon")
      .eq("id_type", "neon_account_id")
      .eq("id_value", accId)
      .maybeSingle();
    if (hit?.person_id) return hit.person_id as string;
  }

  // 2. email match
  if (email) {
    const { data: hit } = await supabase
      .from("person_identifier")
      .select("person_id")
      .eq("id_type", "email")
      .eq("id_value", email)
      .maybeSingle();
    if (hit?.person_id) {
      const personId = hit.person_id as string;
      if (accId) {
        await supabase
          .from("person_identifier")
          .insert({
            person_id: personId,
            source: "neon",
            id_type: "neon_account_id",
            id_value: accId,
            confidence: "auto",
          })
          .then(
            () => undefined,
            () => undefined,
          );
      }
      return personId;
    }
  }

  // 3. name_normalized match (catches guests without account_id/email
  //    who have been seen before under the same name in any source)
if (normName) {
  const { error: nnErr } = await supabase
    .from("person_identifier")
    .insert({
      person_id: personId,
      source: "neon",
      id_type: "name_normalized",
      id_value: normName,
      confidence: "auto",
    });

  // If someone else beat us to inserting this name_normalized identifier,
  // it means another webhook created a person with the same name at the same time.
  // Merge our newly-created person into theirs.
  if (nnErr && String(nnErr.message).includes("duplicate")) {
    const { data: existing } = await supabase
      .from("person_identifier")
      .select("person_id")
      .eq("id_type", "name_normalized")
      .eq("id_value", normName)
      .maybeSingle();
    
    if (existing?.person_id && existing.person_id !== personId) {
      // Merge our loser into their survivor
      await supabase.rpc("merge_persons", {
        survivor: existing.person_id,
        absorbed: [personId],
      });
      return existing.person_id as string;
    }
  }
}

return personId;

  // 4. Create new person
  const displayName =
    [rec.first_name, rec.last_name].filter(Boolean).join(" ").trim() || null;

  const { data: newPerson, error: insErr } = await supabase
    .from("person")
    .insert({
      first_name: rec.first_name,
      last_name: rec.last_name,
      display_name: displayName,
      email: rec.email,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Failed to create person: ${insErr.message}`);

  const personId = newPerson.id as string;

  const idents: Array<{
    person_id: string;
    source: string;
    id_type: string;
    id_value: string;
    confidence: string;
  }> = [];
  if (accId) {
    idents.push({
      person_id: personId,
      source: "neon",
      id_type: "neon_account_id",
      id_value: accId,
      confidence: "auto",
    });
  }
  if (email) {
    idents.push({
      person_id: personId,
      source: "neon",
      id_type: "email",
      id_value: email,
      confidence: "auto",
    });
  }
  if (idents.length) {
    const { error: idErr } = await supabase
      .from("person_identifier")
      .insert(idents);
    if (idErr && !String(idErr.message).includes("duplicate")) {
      throw new Error(`Failed to insert identifiers: ${idErr.message}`);
    }
  }

  if (normName) {
    await supabase
      .from("person_identifier")
      .insert({
        person_id: personId,
        source: "neon",
        id_type: "name_normalized",
        id_value: normName,
        confidence: "auto",
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return personId;
}

// ---- Registration handler ----

async function handleRegistration(
  payload: NeonRegistrationPayload,
): Promise<{ processed: number; errors: string[] }> {
  const supabase = getServiceClient();

  const eventTrigger = payload.eventTrigger;
  const neonEventId = payload.data?.eventId ?? null;
  const neonRegistrationId = payload.data?.id ?? null;
  const registrantAccountId = payload.data?.registrantAccountId ?? null;

  const attendees = payload.data?.tickets?.[0]?.attendees ?? [];

  if (attendees.length === 0) {
    console.log(`[${eventTrigger}] No attendees in payload`);
    return { processed: 0, errors: [] };
  }

  const errors: string[] = [];
  let processed = 0;

  for (const a of attendees) {
    try {
      const firstName = clean(a.firstName);
      const lastName = clean(a.lastName);
      const accId = a.accountId ? String(a.accountId) : null;
      const email = normEmail(a.email);

      // Resolve person_id
      const personId = await resolvePersonId(supabase, {
        neon_account_id: accId,
        email,
        first_name: firstName,
        last_name: lastName,
      });

      // Build the event_attendees row
      const row = {
        neon_attendee_id: String(a.attendeeId),
        neon_account_id: accId,
        neon_registrant_account_id: registrantAccountId
          ? String(registrantAccountId)
          : a.registrantAccountId
            ? String(a.registrantAccountId)
            : null,
        neon_registration_id: neonRegistrationId
          ? String(neonRegistrationId)
          : null,
        neon_event_id: neonEventId ? String(neonEventId) : null,
        first_name: firstName,
        last_name: lastName,
        course: getCustomFieldValue(a.attendeeCustomFields, "Course"),
        class_name: getCustomFieldValue(a.attendeeCustomFields, "Class"),
        registration_status: a.registrationStatus ?? null,
        registration_date: a.registrationDate ?? null,
        marked_attended: a.markedAttended ?? null,
        person_id: personId,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("event_attendees")
        .upsert(row, { onConflict: "neon_attendee_id" });
      if (error) throw error;

      processed += 1;
      console.log(
        `[${eventTrigger}] Processed attendee ${a.attendeeId} (${firstName} ${lastName}) → person ${personId}`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "unknown error processing attendee";
      console.error(
        `[${eventTrigger}] Failed for attendee ${a.attendeeId}: ${msg}`,
      );
      errors.push(`attendee ${a.attendeeId}: ${msg}`);
    }
  }

  return { processed, errors };
}

// ---- Route handlers ----

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventTrigger = body?.eventTrigger ?? "unknown";

    console.log("=== Neon Webhook Received ===");
    console.log("Event Type:", eventTrigger);

    if (
      eventTrigger === "createEventRegistration" ||
      eventTrigger === "updateEventRegistration"
    ) {
      const result = await handleRegistration(body as NeonRegistrationPayload);
      console.log(
        `[${eventTrigger}] Done: ${result.processed} processed, ${result.errors.length} errors`,
      );
      if (result.errors.length > 0) {
        console.log("Errors:", result.errors);
      }
    } else {
      // For other webhook types, keep logging the full payload so we can see what comes through
      console.log("Full Payload:", JSON.stringify(body, null, 2));
    }

    console.log("=== End Webhook ===");
    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("Webhook error:", msg);
    // Returning 500 makes Neon retry. If the error is non-transient, we may want
    // to return 200 to stop retries, but for now we surface the failure.
    return NextResponse.json(
      { error: "Failed to process webhook", message: msg },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "neon-webhook" });
}