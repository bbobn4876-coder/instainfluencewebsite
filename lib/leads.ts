/**
 * Lead sourcing: five independent modules that each look for businesses which
 * need an agency, and hand back the same shape so the page can show them side
 * by side.
 *
 * A module is either live (it has a way in that does not fight the platform) or
 * unavailable, and says which it is. Nothing here rotates proxies, spins up
 * duplicate accounts or drives a logged-in user session — see MODULES for what
 * each one actually uses.
 */

export type LeadSource = "avito" | "telegram" | "vk" | "maps" | "instagram";

export const LEAD_SOURCES: LeadSource[] = ["avito", "telegram", "vk", "maps", "instagram"];

/** Why a lead is worth a call, strongest first. */
export type LeadSignal =
  | "asking" // they are openly looking for a contractor
  | "stale" // their feed has gone quiet
  | "noVideo" // no reels or clips at all
  | "noSocial" // a business with no social presence linked
  | "highRating"; // established enough to pay

export type Lead = {
  id: string;
  source: LeadSource;
  /** Business or person the lead is about. */
  name: string;
  /** What they said, or what the listing is for. */
  context: string;
  city: string;
  category: string;
  url: string;
  phones: string[];
  emails: string[];
  /** Telegram, Instagram and the rest, as found. */
  links: { platform: string; url: string }[];
  signals: LeadSignal[];
  /** 0–100, derived from the signals below. */
  priority: number;
  foundAt: string;
};

export type LeadQuery = {
  sources: LeadSource[];
  city: string;
  categories: string[];
  keywords: string[];
  /** Skip anything whose text matches these, e.g. competing agencies. */
  stopWords: string[];
  limit: number;
};

/** What each module needs, and what it is allowed to do. */
export type ModuleInfo = {
  id: LeadSource;
  /** The credential that turns it on, if any. */
  envKey?: string;
  /** Set when the module cannot run as specified. */
  unavailable?: "no-public-api";
};

export const MODULES: Record<LeadSource, ModuleInfo> = {
  // Avito publishes no API for this, and the only way in described was an
  // evasion stack — headless browsers behind mobile proxies with rotated
  // fingerprints, built to defeat their bot protection. That is not built here.
  avito: { id: "avito", unavailable: "no-public-api" },
  // The Bot API, reading the chats the bot has been added to.
  telegram: { id: "telegram", envKey: "TELEGRAM_BOT_TOKEN" },
  // VK's own API, as the brief asks.
  vk: { id: "vk", envKey: "VK_SERVICE_TOKEN" },
  // 2GIS publishes a catalog API; Yandex has a Places API on the same footing.
  maps: { id: "maps", envKey: "DGIS_API_KEY" },
  // The same paid API the creator search already uses.
  instagram: { id: "instagram", envKey: "HIKER_TOKEN" },
};

const SIGNAL_WEIGHT: Record<LeadSignal, number> = {
  asking: 55,
  stale: 20,
  noVideo: 15,
  noSocial: 12,
  highRating: 10,
};

/** Someone asking out loud outranks a business that merely looks neglected. */
export function priorityOf(signals: LeadSignal[]): number {
  const total = signals.reduce((sum, signal) => sum + SIGNAL_WEIGHT[signal], 0);
  return Math.min(100, total);
}

/** Drops anything matching a stop word, and anything seen twice. */
export function cleanLeads(leads: Lead[], stopWords: string[]): Lead[] {
  const blocked = stopWords.map((word) => word.trim().toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const out: Lead[] = [];

  for (const lead of leads) {
    const haystack = `${lead.name} ${lead.context}`.toLowerCase();
    if (blocked.some((word) => haystack.includes(word))) continue;
    // The same business can surface from two modules at once.
    const key = lead.url || `${lead.source}:${lead.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }

  return out.sort((a, b) => b.priority - a.priority);
}

export const DEFAULT_STOP_WORDS = [
  "агентство",
  "вакансия",
  "стажировка",
  "обучение",
  "курс",
  "инфобиз",
];

export const LEAD_CATEGORIES = [
  "restaurants",
  "beauty",
  "fitness",
  "clinics",
  "auto",
  "retail",
  "hotels",
  "events",
  "education",
  "realestate",
];
