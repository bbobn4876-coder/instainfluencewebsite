import { NextResponse } from "next/server";
import { emailConfigured, runOutreach } from "@/lib/outreach";
import type { Influencer } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 200;

export async function GET() {
  return NextResponse.json({ emailConfigured: await emailConfigured() });
}

export async function POST(request: Request) {
  let payload: {
    influencers?: Influencer[];
    subject?: string;
    body?: string;
    channels?: { email?: boolean; instagram?: boolean; other?: boolean };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const influencers = Array.isArray(payload.influencers) ? payload.influencers : [];
  if (influencers.length === 0) {
    return NextResponse.json({ error: "Select at least one influencer." }, { status: 400 });
  }
  if (influencers.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients in one run (max ${MAX_RECIPIENTS}).` },
      { status: 400 },
    );
  }
  if (!payload.body?.trim()) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const channels = {
    email: payload.channels?.email ?? true,
    instagram: payload.channels?.instagram ?? false,
    other: payload.channels?.other ?? false,
  };
  if (!channels.email && !channels.instagram && !channels.other) {
    return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 });
  }

  const results = await runOutreach({
    influencers,
    subject: payload.subject?.trim() || "Collaboration",
    body: payload.body,
    channels,
  });

  return NextResponse.json({ results, emailConfigured: await emailConfigured() });
}
