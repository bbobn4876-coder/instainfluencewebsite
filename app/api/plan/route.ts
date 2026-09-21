import { NextResponse } from "next/server";
import { UNLIMITED, limitsOf, normalizeConfig, priceLines } from "@/lib/plans";
import { getSubscription, setConfig } from "@/lib/subscription";
import { requireUser } from "@/lib/session";
import type { User } from "@/lib/auth";
import type { Subscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/** One shape for both routes, so the client never has to derive limits itself. */
function payload(user: User, subscription: Subscription) {
  if (user.isAdmin) {
    return {
      config: subscription.config,
      startedAt: subscription.startedAt,
      usedToday: 0,
      unlimited: true,
      limits: UNLIMITED,
      lines: [],
      remaining: UNLIMITED.dailyProfiles,
    };
  }
  const limits = subscription.config ? limitsOf(subscription.config) : null;
  return {
    config: subscription.config,
    startedAt: subscription.startedAt,
    usedToday: subscription.usedToday,
    unlimited: false,
    limits,
    lines: subscription.config ? priceLines(subscription.config) : [],
    remaining: limits ? Math.max(0, limits.dailyProfiles - subscription.usedToday) : 0,
  };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json(payload(user, await getSubscription(user.id)));
}

/** Stores a configuration. Nothing is charged; checkout goes here later. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as { config?: unknown };
  const config = body.config === null ? null : normalizeConfig(body.config);
  return NextResponse.json(payload(user, await setConfig(user.id, config)));
}
