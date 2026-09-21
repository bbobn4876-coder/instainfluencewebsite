import { promises as fs } from "fs";
import path from "path";
import { databaseConfigured, query } from "./db";
import { PLANS, isPlanId, type Plan, type PlanId } from "./plans";

/** What a user's subscription looks like to the rest of the app. */
export type Subscription = {
  plan: PlanId | null;
  startedAt: string | null;
  /** Profiles read today, against the plan's daily allowance. */
  usedToday: number;
  /** UTC day the counter belongs to. */
  day: string;
};

type Stored = { plan: PlanId | null; startedAt: string | null; day: string; used: number };

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "subscriptions.json");

const today = (): string => new Date().toISOString().slice(0, 10);

const empty = (): Stored => ({ plan: null, startedAt: null, day: today(), used: 0 });

async function readFileMap(): Promise<Record<string, Stored>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, Stored>;
  } catch {
    return {};
  }
}

async function writeFileMap(map: Record<string, Stored>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), { mode: 0o600 });
}

type Row = { plan: string | null; started_at: Date | null; day: string | null; used: number | null };

async function load(userId: string): Promise<Stored> {
  if (databaseConfigured()) {
    const rows = await query<Row>(
      "SELECT plan, started_at, day, used FROM subscriptions WHERE user_id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row) return empty();
    return {
      plan: isPlanId(row.plan) ? row.plan : null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      day: row.day ?? today(),
      used: Number(row.used ?? 0),
    };
  }
  return (await readFileMap())[userId] ?? empty();
}

async function save(userId: string, stored: Stored): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `INSERT INTO subscriptions (user_id, plan, started_at, day, used)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET plan = $2, started_at = $3, day = $4, used = $5`,
      [userId, stored.plan, stored.startedAt, stored.day, stored.used],
    );
    return;
  }
  const map = await readFileMap();
  map[userId] = stored;
  await writeFileMap(map);
}

/** The counter resets on its own at the start of each UTC day. */
function rolled(stored: Stored): Stored {
  const day = today();
  return stored.day === day ? stored : { ...stored, day, used: 0 };
}

export async function getSubscription(userId: string): Promise<Subscription> {
  const stored = rolled(await load(userId));
  return {
    plan: stored.plan,
    startedAt: stored.startedAt,
    usedToday: stored.used,
    day: stored.day,
  };
}

export async function setPlan(userId: string, plan: PlanId | null): Promise<Subscription> {
  const stored = rolled(await load(userId));
  const next: Stored = {
    ...stored,
    plan,
    startedAt: plan ? (stored.plan === plan ? stored.startedAt : new Date().toISOString()) : null,
  };
  await save(userId, next);
  return { plan: next.plan, startedAt: next.startedAt, usedToday: next.used, day: next.day };
}

export type Allowance = { plan: Plan; remaining: number } | { plan: null; remaining: 0 };

/** What the user may still parse today, or null when they have no plan. */
export async function allowance(userId: string): Promise<Allowance> {
  const subscription = await getSubscription(userId);
  const plan = subscription.plan ? PLANS[subscription.plan] : null;
  if (!plan) return { plan: null, remaining: 0 };
  return { plan, remaining: Math.max(0, plan.dailyProfiles - subscription.usedToday) };
}

/** Records profiles read; returns what is left afterwards. */
export async function recordUsage(userId: string, profiles: number): Promise<number> {
  if (profiles <= 0) return (await allowance(userId)).remaining;
  const stored = rolled(await load(userId));
  const next = { ...stored, used: stored.used + profiles };
  await save(userId, next);
  const plan = next.plan ? PLANS[next.plan] : null;
  return plan ? Math.max(0, plan.dailyProfiles - next.used) : 0;
}

export async function deleteSubscription(userId: string): Promise<void> {
  if (databaseConfigured()) {
    await query("DELETE FROM subscriptions WHERE user_id = $1", [userId]);
    return;
  }
  const map = await readFileMap();
  delete map[userId];
  await writeFileMap(map);
}
