import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Log everything Neon sends so we can study the structure
    console.log("=== Neon Webhook Received ===");
    console.log("Event Type:", body?.eventTrigger ?? "unknown");
    console.log("Full Payload:", JSON.stringify(body, null, 2));
    console.log("=== End Webhook ===");

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Failed to parse webhook" },
      { status: 400 },
    );
  }
}

// Neon may also send a GET request to verify the endpoint exists
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "neon-webhook" });
}