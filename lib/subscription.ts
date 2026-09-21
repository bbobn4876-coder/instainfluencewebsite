import { promises as fs } from "fs";
import path from "path";
import { databaseConfigured, query } from "./db";
import {
  UNLIMITED,
  limitsOf,
  normalizeConfig,
  type Limits,
  type SubscriptionConfig,
} from "./plans";

/** What a user's subscription looks like to the rest of the app. */
export type Subscription = {
  config: SubscriptionConfig | null;
  startedAt: string | null;
  /** Profiles read today, against the daily allowance. */
  usedToday: number;
  day: string;
  /** Lifetime counters, for the admin panel. */
  totals: Totals;
};

export type Totals = {
  /** Profiles the crawl has read for this user. */
  profiles: number;
  /** Billable requests those reads cost. */
  requests: number;
  /** Recipients messaged. */
  outreach: number;
  /** Searches started. */
  searches: number;
};

type Stored = {
  config: SubscriptionConfig | null;
  startedAt: string | null;
  day: string;
  used: number;
  totals: Totals;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "subscriptions.json");

/** What one request costs us, so spend can be shown per account. */
export const REQUEST_COST = Number(process.env.SOURCE_REQUEST_COST ?? 0.02);

const today = (): string => new Date().toISOString().slice(0, 10);

const noTotals = (): Totals => ({ profiles: 0, requests: 0, outreach: 0, searches: 0 });

const empty = (): Stored => ({
  config: null,
  startedAt: null,
  day: today(),
  used: 0,
  totals: noTotals(),
});

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

type Row = {
  config: SubscriptionConfig | null;
  started_at: Date | null;
  day: string | null;
  used: number | null;
  totals: Totals | null;
};

async function load(userId: string): Promise<Stored> {
  if (databaseConfigured()) {
    const rows = await query<Row>(
      "SELECT config, started_at, day, used, totals FROM subscriptions WHERE user_id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row) return empty();
    return {
      config: row.config ? normalizeConfig(row.config) : null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      day: row.day ?? today(),
      used: Number(row.used ?? 0),
      totals: { ...noTotals(), ...(row.totals ?? {}) },
    };
  }
  const stored = (await readFileMap())[userId];
  return stored ? { ...empty(), ...stored, totals: { ...noTotals(), ...stored.totals } } : empty();
}

async function save(userId: string, stored: Stored): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `INSERT INTO subscriptions (user_id, config, started_at, day, used, totals)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE
         SET config = $2, started_at = $3, day = $4, used = $5, totals = $6`,
      [
        userId,
        stored.config ? JSON.stringify(stored.config) : null,
        stored.startedAt,
        stored.day,
        stored.used,
        JSON.stringify(stored.totals),
      ],
    );
    return;
  }
  const map = await readFileMap();
  map[userId] = stored;
  await writeFileMap(map);
}

/** The daily counter resets on its own at the start of each UTC day. */
function rolled(stored: Stored): Stored {
  const day = today();
  return stored.day === day ? stored : { ...stored, day, used: 0 };
}

const toSubscription = (stored: Stored): Subscription => ({
  config: stored.config,
  startedAt: stored.startedAt,
  usedToday: stored.used,
  day: stored.day,
  totals: stored.totals,
});

export async function getSubscription(userId: string): Promise<Subscription> {
  return toSubscription(rolled(await load(userId)));
}

/** Stores a configuration, or clears the subscription when given null. */
export async function setConfig(
  userId: string,
  config: SubscriptionConfig | null,
): Promise<Subscription> {
  const stored = rolled(await load(userId));
  const next: Stored = {
    ...stored,
    config,
    startedAt: config ? (stored.startedAt ?? new Date().toISOString()) : null,
  };
  await save(userId, next);
  return toSubscription(next);
}

export type Allowance = { limits: Limits; remaining: number } | { limits: null; remaining: 0 };

/**
 * What the user may still parse today. The admin account is never metered, so
 * it always reports a full allowance whatever is stored against it.
 */
export async function allowance(userId: string, isAdmin = false): Promise<Allowance> {
  if (isAdmin) return { limits: UNLIMITED, remaining: UNLIMITED.dailyProfiles };
  const subscription = await getSubscription(userId);
  if (!subscription.config) return { limits: null, remaining: 0 };
  const limits = limitsOf(subscription.config);
  return { limits, remaining: Math.max(0, limits.dailyProfiles - subscription.usedToday) };
}

/** Records a round of parsing; returns what is left of the day afterwards. */
export async function recordUsage(
  userId: string,
  profiles: number,
  requests = profiles,
): Promise<number> {
  const stored = rolled(await load(userId));
  const next: Stored = {
    ...stored,
    used: stored.used + Math.max(0, profiles),
    totals: {
      ...stored.totals,
      profiles: stored.totals.profiles + Math.max(0, profiles),
      requests: stored.totals.requests + Math.max(0, requests),
    },
  };
  await save(userId, next);
  const limits = next.config ? limitsOf(next.config) : null;
  return limits ? Math.max(0, limits.dailyProfiles - next.used) : 0;
}

/** Bumps a lifetime counter that is not metered. */
export async function bumpTotal(
  userId: string,
  key: keyof Totals,
  amount = 1,
): Promise<void> {
  const stored = rolled(await load(userId));
  await save(userId, {
    ...stored,
    totals: { ...stored.totals, [key]: stored.totals[key] + amount },
  });
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
