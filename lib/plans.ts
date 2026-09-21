/**
 * Subscription plans. Nothing is charged yet: a plan is picked and stored, and
 * the limits below are what the app actually enforces.
 */
export type PlanId = "standard" | "pro" | "ultra";

export type Plan = {
  id: PlanId;
  /** Profiles the crawl may read per day. */
  dailyProfiles: number;
  /** How many mailboxes and social accounts outreach may be sent from. */
  senders: number;
  /** Support queue. */
  prioritySupport: boolean;
  /** Monthly price, shown on the landing page; billing is not wired up. */
  price: number;
};

export const PLANS: Record<PlanId, Plan> = {
  standard: { id: "standard", dailyProfiles: 1000, senders: 1, prioritySupport: false, price: 19 },
  pro: { id: "pro", dailyProfiles: 10000, senders: 3, prioritySupport: false, price: 49 },
  ultra: { id: "ultra", dailyProfiles: 50000, senders: 10, prioritySupport: true, price: 129 },
};

export const PLAN_ORDER: PlanId[] = ["standard", "pro", "ultra"];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

export function planOf(id: string | null | undefined): Plan | null {
  return isPlanId(id) ? PLANS[id] : null;
}
