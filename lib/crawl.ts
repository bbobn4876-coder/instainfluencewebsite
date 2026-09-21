import { ALL, countryByCode } from "./countries";
import type { SearchQuery } from "./types";

/** Where a candidate was seen posting from, carried between the two stages. */
export type GeoHint = { code: string; place: string };

/** Numbers behind the funnel, so a thin result set can be explained. */
export type CrawlStats = {
  posts: number;
  candidates: number;
  profiles: number;
  inBand: number;
};

const NICHE_SUFFIXES = [
  "blogger",
  "creator",
  "influencer",
  "daily",
  "life",
  "style",
  "gram",
  "community",
  "tips",
  "addict",
];

/** Hashtag pages per run; more tags means a wider, more varied candidate pool. */
const TAG_LIMIT = Number(process.env.APIFY_TAG_LIMIT ?? 60);

/** Hashtags to scan: the niches themselves, the keyword, and city+niche combinations. */
export function discoveryTags(query: SearchQuery): string[] {
  const niches = query.categories?.includes(ALL)
    ? ["influencer", "creator", "lifestyle", "fashion", "fitness", "travel", "food", "beauty"]
    : (query.categories ?? ["lifestyle"]);
  const cities = query.countries.includes(ALL)
    ? []
    : query.countries.flatMap((code) => countryByCode(code)?.cities ?? []);

  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tags = new Set<string>();

  if (query.keyword?.trim()) tags.add(clean(query.keyword));
  for (const niche of niches) {
    const base = clean(niche);
    tags.add(base);
    // Suffixes pull in the smaller creator accounts rather than the big pages.
    for (const suffix of NICHE_SUFFIXES) tags.add(`${base}${suffix}`);
    // City tags are where smaller, local creators actually show up.
    for (const city of cities) {
      tags.add(`${clean(city)}${base}`);
      tags.add(`${clean(city)}creator`);
    }
  }
  return [...tags].filter(Boolean).slice(0, TAG_LIMIT);
}
