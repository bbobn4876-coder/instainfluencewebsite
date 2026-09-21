import { NextResponse } from "next/server";
import { PLANS, isPlanId } from "@/lib/plans";
import { getSubscription, setPlan } from "@/lib/subscription";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The signed-in user's plan and what is left of today's allowance. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const subscription = await getSubscription(user.id);
  const plan = subscription.plan ? PLANS[subscription.plan] : null;
  return NextResponse.json({
    ...subscription,
    limits: plan,
    remaining: plan ? Math.max(0, plan.dailyProfiles - subscription.usedToday) : 0,
  });
}

/** Picks a plan. Nothing is charged; this is where checkout will go later. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (body.plan !== null && !isPlanId(body.plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const subscription = await setPlan(user.id, body.plan);
  const plan = subscription.plan ? PLANS[subscription.plan] : null;
  return NextResponse.json({
    ...subscription,
    limits: plan,
    remaining: plan ? Math.max(0, plan.dailyProfiles - subscription.usedToday) : 0,
  });
}
