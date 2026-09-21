import { NextResponse } from "next/server";
import { emailConfigured, runOutreach } from "@/lib/outreach";
import { requireUser } from "@/lib/session";
import { allowance, bumpTotal } from "@/lib/subscription";
import { readSettings } from "@/lib/settings";
import type { Influencer } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 200;

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const quota = await allowance(user.id, user.isAdmin);
  if (!quota.limits) {
    return NextResponse.json(
      { error: "Pick a plan to use this.", reason: "no-plan" },
      { status: 402 },
    );
  }
  return NextResponse.json({ emailConfigured: await emailConfigured(user.id) });
}

export async function POST(request: Request) {
  const { user, response: denied } = await requireUser();
  if (!user) return denied;

  // Sending is what the gate is for; the GET above only reports readiness.
  const quota = await allowance(user.id, user.isAdmin);
  if (!quota.limits) {
    return NextResponse.json(
      { error: "Pick a plan to use this.", reason: "no-plan" },
      { status: 402 },
    );
  }

  let payload: {
    influencers?: Influencer[];
    subject?: string;
    body?: string;
    channels?: { email?: boolean; instagram?: boolean; other?: boolean };
    fromMailbox?: string;
    senders?: Record<string, string>;
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

  // The plan decides how many mailboxes may send; anything past that falls
  // back to the primary one rather than being silently honoured.
  const settings = await readSettings(user.id);
  const senderLimit = quota.limits?.senders ?? 1;
  const allowed = new Set(settings.mailboxes.slice(0, senderLimit).map((box) => box.id));
  const senders: Record<string, string> = {};
  for (const [id, mailbox] of Object.entries(payload.senders ?? {})) {
    if (allowed.has(mailbox)) senders[id] = mailbox;
  }

  const results = await runOutreach({
    userId: user.id,
    influencers,
    subject: payload.subject?.trim() || "Collaboration",
    body: payload.body,
    channels,
    fromMailbox: allowed.has(String(payload.fromMailbox)) ? payload.fromMailbox : undefined,
    senders,
  });

  await bumpTotal(user.id, "outreach", results.length);
  return NextResponse.json({ results, emailConfigured: await emailConfigured(user.id) });
}
