/**
 * One lead search, shared by the page's API route and the Telegram bot, so both
 * surfaces run exactly the same modules, limits and cleaning.
 */
import {
  DEFAULT_STOP_WORDS,
  LEAD_SOURCES,
  MODULES,
  cleanLeads,
  type Lead,
  type LeadQuery,
  type LeadSource,
} from "./leads";
import { instagramLeads } from "./leadSources/instagram";
import { mapsLeads } from "./leadSources/maps";
import { sampleLeads } from "./leadSources/sample";
import { telegramLeads } from "./leadSources/telegram";
import { vkLeads } from "./leadSources/vk";
import { bumpTotal } from "./subscription";

const RUNNERS: Partial<Record<LeadSource, (query: LeadQuery) => Promise<Lead[]>>> = {
  vk: vkLeads,
  telegram: telegramLeads,
  maps: mapsLeads,
  instagram: instagramLeads,
};

export type LeadSearchResult = {
  leads: Lead[];
  /** Modules that actually ran. */
  ran: LeadSource[];
  /** Asked for but not configured, or not available at all. */
  skipped: LeadSource[];
  /** "sample" when nothing is connected, plus one line per module that failed. */
  notes: string[];
};

/** Fills in the defaults and drops anything that cannot run. */
export function toLeadQuery(payload: Partial<LeadQuery>): LeadQuery {
  const asked = Array.isArray(payload.sources) ? payload.sources : [];
  return {
    sources: LEAD_SOURCES.filter((id) => asked.includes(id) && !MODULES[id].unavailable),
    city: typeof payload.city === "string" ? payload.city.trim() : "",
    categories: Array.isArray(payload.categories) ? payload.categories.map(String) : [],
    keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String).filter(Boolean) : [],
    stopWords: Array.isArray(payload.stopWords) ? payload.stopWords.map(String) : DEFAULT_STOP_WORDS,
    limit: Number.isFinite(payload.limit) ? Math.min(200, Number(payload.limit)) : 60,
  };
}

/** Which of the asked-for modules have their credential in place. */
export function liveSources(sources: LeadSource[]): LeadSource[] {
  return sources.filter((id) => {
    const key = MODULES[id].envKey;
    return key ? Boolean(process.env[key]) : false;
  });
}

export async function runLeadSearch(
  userId: string,
  query: LeadQuery,
): Promise<LeadSearchResult> {
  const live = liveSources(query.sources);
  const notes: string[] = [];
  let leads: Lead[] = [];

  if (live.length === 0) {
    leads = sampleLeads(query);
    notes.push("sample");
  } else {
    const runs = await Promise.all(
      live.map(async (id) => {
        try {
          return await (RUNNERS[id]?.(query) ?? Promise.resolve([]));
        } catch (error) {
          notes.push(`${id}: ${(error as Error).message}`);
          return [];
        }
      }),
    );
    leads = runs.flat();
  }

  await bumpTotal(userId, "searches");

  return {
    leads: cleanLeads(leads, query.stopWords).slice(0, query.limit),
    ran: live,
    skipped: query.sources.filter((id) => !live.includes(id)),
    notes,
  };
}
