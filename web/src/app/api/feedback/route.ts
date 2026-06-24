import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServiceClient } from "@/lib/supabase/server";

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 2_000;
const MIN_FORM_DURATION_MS = 2_000;
const MAX_MESSAGE_LENGTH = 5000;
const ALLOWED_TYPES = ["Feedback", "Bug report", "Feature request"] as const;

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "default-salt-change-me";
  return crypto.createHash("sha256").update(ip + salt).digest("hex");
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function pruneOldEntries() {
  const now = Date.now();
  for (const [key, ts] of rateLimitMap.entries()) {
    if (now - ts > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const {
    type,
    message,
    url_path,
    website,
    opened_at,
  } = body as Record<string, unknown>;

  if (typeof website === "string" && website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (typeof opened_at === "number") {
    const elapsed = Date.now() - opened_at;
    if (elapsed < MIN_FORM_DURATION_MS) {
      return NextResponse.json({ ok: true });
    }
  } else {
    return NextResponse.json({ ok: true });
  }

  if (typeof type !== "string" || !ALLOWED_TYPES.includes(type as typeof ALLOWED_TYPES[number])) {
    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ ok: false, error: "Message too long" }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (ip) {
    pruneOldEntries();
    const key = hashIp(ip);
    const previous = rateLimitMap.get(key);
    if (previous && Date.now() - previous < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json(
        { ok: false, error: "Please wait a moment before submitting again." },
        { status: 429 },
      );
    }
    rateLimitMap.set(key, Date.now());
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from("feedback").insert({
    type,
    message: message.trim(),
    url_path: typeof url_path === "string" ? url_path : null,
  });

  if (error) {
    console.error("Feedback insert error:", error);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}