/**
 * A subscription is configured rather than picked off a shelf: a parsing
 * volume, how many accounts outreach may be sent from, how deep the search
 * goes and whether support is prioritised. Each choice adds to the monthly
 * price, the way a hardware configurator works.
 *
 * Nothing is charged yet — the configuration is stored and the limits below
 * are what the server actually enforces.
 */

export type VolumeId = "starter" | "growth" | "scale";
export type DepthId = "standard" | "deep";

export type VolumeTier = { id: VolumeId; dailyProfiles: number; price: number };

export const VOLUMES: Record<VolumeId, VolumeTier> = {
  starter: { id: "starter", dailyProfiles: 500, price: 19 },
  growth: { id: "growth", dailyProfiles: 2500, price: 44 },
  scale: { id: "scale", dailyProfiles: 10000, price: 99 },
};

export const VOLUME_ORDER: VolumeId[] = ["starter", "growth", "scale"];

/** One sender is included; every extra one is billed. */
export const SENDER_INCLUDED = 1;
export const SENDER_MAX = 10;
export const SENDER_PRICE = 6;

/**
 * How far the search reaches. "Deep" runs the wider, faster crawl — which
 * costs us more per search, hence the surcharge.
 */
export const DEPTHS: Record<DepthId, { id: DepthId; price: number }> = {
  standard: { id: "standard", price: 0 },
  deep: { id: "deep", price: 29 },
};

export const PRIORITY_SUPPORT_PRICE = 15;

export type SubscriptionConfig = {
  volume: VolumeId;
  senders: number;
  depth: DepthId;
  prioritySupport: boolean;
};

export const DEFAULT_CONFIG: SubscriptionConfig = {
  volume: "starter",
  senders: SENDER_INCLUDED,
  depth: "standard",
  prioritySupport: false,
};

export function isVolumeId(value: unknown): value is VolumeId {
  return typeof value === "string" && value in VOLUMES;
}

export function isDepthId(value: unknown): value is DepthId {
  return typeof value === "string" && value in DEPTHS;
}

/** Clamps anything that arrives from a client into a valid configuration. */
export function normalizeConfig(input: unknown): SubscriptionConfig {
  const raw = (input ?? {}) as Partial<SubscriptionConfig>;
  const senders = Number(raw.senders);
  return {
    volume: isVolumeId(raw.volume) ? raw.volume : DEFAULT_CONFIG.volume,
    senders: Number.isFinite(senders)
      ? Math.min(SENDER_MAX, Math.max(SENDER_INCLUDED, Math.round(senders)))
      : DEFAULT_CONFIG.senders,
    depth: isDepthId(raw.depth) ? raw.depth : DEFAULT_CONFIG.depth,
    prioritySupport: Boolean(raw.prioritySupport),
  };
}

/** Every line of the bill, so the page and the server always agree. */
export type PriceLine = { key: string; amount: number };

export function priceLines(config: SubscriptionConfig): PriceLine[] {
  const lines: PriceLine[] = [{ key: `volume.${config.volume}`, amount: VOLUMES[config.volume].price }];
  const extra = config.senders - SENDER_INCLUDED;
  if (extra > 0) lines.push({ key: "senders", amount: extra * SENDER_PRICE });
  if (config.depth !== "standard") lines.push({ key: "depth", amount: DEPTHS[config.depth].price });
  if (config.prioritySupport) lines.push({ key: "support", amount: PRIORITY_SUPPORT_PRICE });
  return lines;
}

export function priceOf(config: SubscriptionConfig): number {
  return priceLines(config).reduce((total, line) => total + line.amount, 0);
}

/** What the configuration actually unlocks. */
export type Limits = {
  dailyProfiles: number;
  senders: number;
  depth: DepthId;
  prioritySupport: boolean;
  price: number;
};

export function limitsOf(config: SubscriptionConfig): Limits {
  return {
    dailyProfiles: VOLUMES[config.volume].dailyProfiles,
    senders: config.senders,
    depth: config.depth,
    prioritySupport: config.prioritySupport,
    price: priceOf(config),
  };
}

/** The admin account is never metered. */
export const UNLIMITED: Limits = {
  dailyProfiles: Number.MAX_SAFE_INTEGER,
  senders: SENDER_MAX,
  depth: "deep",
  prioritySupport: true,
  price: 0,
};
