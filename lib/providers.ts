import { ALL, countryByCode } from "./countries";
import { countryOfLocation, placeInText, verdictFor } from "./geo";
import { extractEmails, extractLinks, extractPhones } from "./contacts";
import { mockSearch } from "./mock";
import type { Influencer, SearchQuery } from "./types";

export type ProviderName = "mock" | "apify" | "instagram-graph";

export function activeProvider(): ProviderName {
  if (process.env.APIFY_TOKEN) return "apify";
  if (process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID) return "instagram-graph";
  return "mock";
}

type ApifyPost = {
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  type?: string;
  productType?: string;
};

type ApifyItem = {
  id?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  externalUrl?: string;
  profilePicUrl?: string;
  businessEmail?: string;
  businessPhoneNumber?: string;
  businessCategoryName?: string;
  latestPosts?: ApifyPost[];
  /** "Suggested for you" accounts, the seed for the snowball crawl. */
  relatedProfiles?: { username?: string }[];
};

function median(values: number[]): number | undefined {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Medians over the posts the actor returns, and the engagement rate they imply. */
function postMetrics(posts: ApifyPost[] | undefined, followers: number) {
  const list = posts ?? [];
  const medianLikes = median(list.map((p) => p.likesCount ?? NaN));
  const medianComments = median(list.map((p) => p.commentsCount ?? NaN));
  const reels = list.filter((p) => p.type === "Video" || p.productType === "clips");
  const medianReelViews = median(
    reels.map((p) => p.videoPlayCount ?? p.videoViewCount ?? NaN),
  );
  const engagementRate =
    followers > 0 && (medianLikes !== undefined || medianComments !== undefined)
      ? Number(((((medianLikes ?? 0) + (medianComments ?? 0)) / followers) * 100).toFixed(2))
      : 0;
  return { medianLikes, medianComments, medianReelViews, engagementRate };
}

/** The town out of a geo hint, unless the hint is only the country itself. */
function cityOf(geo?: GeoHint): string | undefined {
  if (!geo?.place) return undefined;
  const place = geo.place.split(",")[0].trim();
  if (!place || place.toLowerCase() === (countryByCode(geo.code)?.name ?? "").toLowerCase()) {
    return undefined;
  }
  return place;
}

function toInfluencer(
  item: ApifyItem,
  query: SearchQuery,
  source: Influencer["source"],
  geo?: GeoHint,
): Influencer | null {
  if (!item.username) return null;
  const bio = item.biography ?? "";
  const followers = item.followersCount ?? 0;
  const metrics = postMetrics(item.latestPosts, followers);
  return {
    id: `${source}:${item.id ?? item.username}`,
    username: item.username,
    fullName: item.fullName ?? item.username,
    biography: bio,
    followers,
    engagementRate: metrics.engagementRate,
    medianLikes: metrics.medianLikes,
    medianComments: metrics.medianComments,
    medianReelViews: metrics.medianReelViews,
    country: geo?.code ?? (query.countries.includes(ALL) ? "" : (query.countries[0] ?? "")),
    // Only set when a post or the bio proves where they are; a bare country
    // name is not a city, so it is left off rather than repeated on the card.
    city: cityOf(geo),
    category:
      item.businessCategoryName ??
      (query.categories?.includes(ALL) ? "lifestyle" : (query.categories?.[0] ?? "lifestyle")),
    avatarUrl: item.profilePicUrl,
    profileUrl: `https://instagram.com/${item.username}`,
    emails: extractEmails(bio, item.businessEmail),
    phones: extractPhones(bio, item.businessPhoneNumber),
    links: extractLinks(bio, item.externalUrl),
    source,
  };
}

export type ApifyStage = "discover" | "details";
/** Where a candidate was seen posting from, carried between the two stages. */
export type GeoHint = { code: string; place: string };
export type ApifyRun = {
  runId: string;
  datasetId: string;
  stage: ApifyStage;
  geo?: Record<string, GeoHint>;
  /** Every username ever queued, in the order they will be read. */
  seen?: string[];
  /** How far into `seen` the profile rounds have got. */
  cursor?: number;
  stats?: CrawlStats;
};

/** Numbers behind the funnel, so a thin result set can be explained. */
export type CrawlStats = {
  posts: number;
  candidates: number;
  profiles: number;
  inBand: number;
};

/**
 * Apify bills per scraped result, so one search has a result budget and the
 * two stages split it. Roughly a third goes on finding candidates and the rest
 * on reading their profiles. At the instagram-scraper's usual rate this is
 * about $2.3 per 1000 results, so the default search costs a few dollars —
 * raise APIFY_RESULT_BUDGET only as far as the Apify plan allows.
 */
const RESULT_BUDGET = Number(process.env.APIFY_RESULT_BUDGET ?? 3000);

/** How many hashtag posts to scan for candidates before fetching their profiles. */
const CANDIDATE_POOL = Number(
  process.env.APIFY_CANDIDATE_POOL ?? Math.round(RESULT_BUDGET / 3),
);

/** Ceiling on the crawl: hashtag candidates plus everything it snowballs into. */
const PROFILE_BUDGET = Number(
  process.env.APIFY_PROFILE_BUDGET ?? RESULT_BUDGET - Math.round(RESULT_BUDGET / 3),
);

/** Profiles per round: small enough that a round finishes in a minute or so. */
const PROFILE_BATCH = Number(process.env.APIFY_PROFILE_BATCH ?? 200);

/** Keeps every call well inside a serverless function's time limit. */
/** Turns Apify's raw error bodies into something a user can act on. */
function apifyMessage(status: number, body: string): string {
  if (/hard limit exceeded|platform-feature-disabled/i.test(body)) {
    return (
      "Your Apify account has used up its monthly quota, so no new scraping " +
      "can start. Raise the limit or top up the account in the Apify console " +
      "(Settings → Limits / Billing), then run the search again."
    );
  }
  if (status === 401 || status === 403) {
    return "Apify refused the token. Check APIFY_TOKEN in your environment variables.";
  }
  if (status === 429) {
    return "Apify is rate-limiting this account. Wait a minute and try again.";
  }
  return `Apify ${status}: ${body.slice(0, 200)}`;
}

async function apifyFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(apifyMessage(res.status, await res.text()));
  }
  return res;
}

async function startRun(input: Record<string, unknown>, stage: ApifyStage): Promise<ApifyRun> {
  const token = process.env.APIFY_TOKEN!;
  const actor = process.env.APIFY_ACTOR_ID ?? "apify~instagram-scraper";
  const res = await apifyFetch(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addParentData: false, ...input }),
    },
  );
  const data = (await res.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  if (!data.data?.id || !data.data.defaultDatasetId) {
    throw new Error("Apify did not return a run id.");
  }
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId, stage };
}

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
function discoveryTags(query: SearchQuery): string[] {
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

/**
 * Stage one: collect candidate usernames from hashtag pages. Instagram's own
 * user search only ever returns a handful of very large accounts, so a follower
 * range like 3k–10k came back almost empty; posts under a hashtag are where
 * smaller creators are.
 */
export async function startApifyRun(query: SearchQuery): Promise<ApifyRun> {
  const tags = discoveryTags(query);
  return startRun(
    {
      directUrls: tags.map((tag) => `https://www.instagram.com/explore/tags/${tag}/`),
      resultsType: "posts",
      // resultsLimit counts per hashtag page, so the pool is split across them.
      resultsLimit: Math.max(50, Math.ceil(CANDIDATE_POOL / Math.max(1, tags.length))),
    },
    "discover",
  );
}

/** Stage two: the profiles behind those posts, with follower counts and bios. */
async function startDetailsRun(usernames: string[]): Promise<ApifyRun> {
  return startRun(
    {
      directUrls: usernames.map((name) => `https://www.instagram.com/${name}/`),
      resultsType: "details",
      resultsLimit: usernames.length,
    },
    "details",
  );
}

export type RunStatus =
  | { status: "running"; run: ApifyRun; scanned?: number; influencers?: Influencer[] }
  | {
      status: "done";
      influencers: Influencer[];
      scanned: number;
      matched: number;
      confirmed?: number;
      stats?: CrawlStats;
    }
  | { status: "failed"; detail: string };

const PAGE_SIZE = 2000;

/**
 * Reads a dataset in pages. `fields` keeps the payload small — the candidate
 * pool runs to tens of thousands of posts and only two of their keys matter.
 */
async function datasetItems<T>(
  datasetId: string,
  limit: number,
  fields?: string[],
): Promise<T[]> {
  const token = encodeURIComponent(process.env.APIFY_TOKEN!);
  const select = fields?.length ? `&fields=${fields.join(",")}` : "";
  const items: T[] = [];
  // The whole poll has to answer inside the serverless window.
  const deadline = Date.now() + 6_000;
  while (items.length < limit && Date.now() < deadline) {
    const page = Math.min(PAGE_SIZE, limit - items.length);
    const res = await apifyFetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true` +
        `&limit=${page}&offset=${items.length}${select}`,
    );
    const batch = (await res.json()) as T[];
    items.push(...batch);
    if (batch.length < page) break;
  }
  return items;
}

/** One quick check of a started run; the client calls this until it settles. */
export async function pollApifyRun(run: ApifyRun, query: SearchQuery): Promise<RunStatus> {
  const token = encodeURIComponent(process.env.APIFY_TOKEN!);
  const res = await apifyFetch(`https://api.apify.com/v2/actor-runs/${run.runId}?token=${token}`);
  const data = (await res.json()) as { data?: { status?: string } };
  const state = data.data?.status ?? "UNKNOWN";

  if (state === "READY" || state === "RUNNING") return { status: "running", run };
  if (state !== "SUCCEEDED") {
    return { status: "failed", detail: `The Apify run ${state.toLowerCase()}.` };
  }

  if (run.stage === "discover") {
    const posts = await datasetItems<{ ownerUsername?: string; locationName?: string }>(
      run.datasetId,
      CANDIDATE_POOL,
      ["ownerUsername", "locationName"],
    );
    const wanted = query.countries.includes(ALL) ? [] : query.countries;

    // A creator is judged by the places they tag: a post in the requested
    // country confirms them, a post elsewhere rules them out, no location at
    // all leaves them as a maybe.
    const seen = new Map<string, { hits: Map<string, string>; other: number }>();
    for (const post of posts) {
      if (!post.ownerUsername) continue;
      const entry = seen.get(post.ownerUsername) ?? { hits: new Map(), other: 0 };
      const verdict = wanted.length === 0 ? "unknown" : verdictFor(post.locationName, wanted);
      if (verdict === "match") {
        const code = countryOfLocation(post.locationName)!;
        entry.hits.set(code, post.locationName ?? "");
      } else if (verdict === "other") {
        entry.other += 1;
      }
      seen.set(post.ownerUsername, entry);
    }

    const confirmed: string[] = [];
    const maybe: string[] = [];
    const geo: Record<string, GeoHint> = {};
    for (const [username, entry] of seen) {
      if (entry.hits.size > 0) {
        const [code, place] = [...entry.hits.entries()][0];
        geo[username] = { code, place };
        confirmed.push(username);
      } else if (entry.other === 0) {
        maybe.push(username);
      }
    }

    // Confirmed accounts first; the maybes fill the rest of the budget.
    const capped = [...confirmed, ...maybe].slice(0, PROFILE_BUDGET);
    if (capped.length === 0) {
      return { status: "failed", detail: "No accounts found under those hashtags." };
    }
    // Profiles are read in rounds so no single Apify run runs for ages.
    const batch = capped.slice(0, PROFILE_BATCH);
    return {
      status: "running",
      run: {
        ...(await startDetailsRun(batch)),
        geo,
        seen: capped,
        cursor: batch.length,
        stats: { posts: posts.length, candidates: capped.length, profiles: 0, inBand: 0 },
      },
      scanned: capped.length,
    };
  }

  const items = await datasetItems<ApifyItem>(run.datasetId, PROFILE_BATCH * 2);
  const hints = { ...(run.geo ?? {}) };
  const wanted = query.countries.includes(ALL) ? [] : query.countries;

  // Geotags only cover the creators who tag their posts. The bio names a place
  // far more often ("📍NY", "Los Angeles | Dallas"), so it is read as a second
  // source: it confirms a candidate, or rules one out as clearly elsewhere.
  const ruledOut = new Set<string>();
  for (const item of items) {
    const name = item.username;
    if (!name || hints[name] || wanted.length === 0) continue;
    const found = placeInText(item.biography);
    if (!found) continue;
    if (wanted.includes(found.code)) hints[name] = found;
    else ruledOut.add(name);
  }

  const all = items
    .filter((item) => !ruledOut.has(item.username ?? ""))
    .map((item) => toInfluencer(item, query, "apify", hints[item.username ?? ""]))
    .filter((i): i is Influencer => i !== null);
  const matched = all
    .filter((i) => i.followers >= (query.minFollowers ?? 0))
    .filter((i) => !query.maxFollowers || i.followers <= query.maxFollowers)
    .sort((a, b) => b.followers - a.followers);

  // With a geo chosen, a confirmed location outranks a guess.
  const ranked = wanted.length
    ? [...matched].sort((a, b) => Number(Boolean(b.city)) - Number(Boolean(a.city)))
    : matched;

  // Hashtags alone run dry fast. Every account that lands in the follower band
  // is a seed: Instagram's own "related profiles" for it are overwhelmingly
  // accounts of the same size, niche and country, so the crawl snowballs.
  const seen = [...(run.seen ?? [])];
  const known = new Set(seen);
  const inBand = new Set(matched.map((i) => i.username));
  for (const item of items) {
    if (seen.length >= PROFILE_BUDGET) break;
    if (!item.username || !inBand.has(item.username)) continue;
    for (const related of item.relatedProfiles ?? []) {
      const name = related.username;
      if (!name || known.has(name) || seen.length >= PROFILE_BUDGET) continue;
      known.add(name);
      seen.push(name);
    }
  }

  const before = run.stats ?? { posts: 0, candidates: 0, profiles: 0, inBand: 0 };
  const stats: CrawlStats = {
    posts: before.posts,
    candidates: seen.length,
    profiles: before.profiles + items.length,
    inBand: before.inBand + matched.length,
  };

  // More candidates waiting? Hand back this round's results and start the next.
  const cursor = run.cursor ?? seen.length;
  const batch = seen.slice(cursor, cursor + PROFILE_BATCH);
  if (batch.length > 0) {
    return {
      status: "running",
      run: {
        ...(await startDetailsRun(batch)),
        geo: hints,
        seen,
        cursor: cursor + batch.length,
        stats,
      },
      influencers: ranked,
      scanned: stats.profiles,
    };
  }

  return {
    status: "done",
    influencers: ranked,
    scanned: stats.profiles,
    matched: stats.inBand,
    confirmed: ranked.filter((i) => i.city).length,
    stats,
  };
}
function shapeApifyItems(items: ApifyItem[], query: SearchQuery): Influencer[] {
  return items
    .map((item) => toInfluencer(item, query, "apify"))
    .filter((i): i is Influencer => i !== null)
    .filter((i) => i.followers >= (query.minFollowers ?? 0))
    .filter((i) => !query.maxFollowers || i.followers <= query.maxFollowers)
    .sort((a, b) => b.followers - a.followers);
}

/**
 * Instagram Graph API business discovery. Only resolves accounts by exact
 * username, so the keyword is treated as a handle lookup.
 */
async function graphSearch(query: SearchQuery): Promise<Influencer[]> {
  const handle = query.keyword?.trim().replace(/^@/, "");
  if (!handle) return [];
  const token = process.env.IG_ACCESS_TOKEN!;
  const account = process.env.IG_BUSINESS_ACCOUNT_ID!;
  const fields = `business_discovery.username(${handle}){id,username,name,biography,followers_count,website,profile_picture_url}`;
  const url = `https://graph.facebook.com/v21.0/${account}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Instagram Graph request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    business_discovery?: {
      id: string;
      username: string;
      name?: string;
      biography?: string;
      followers_count?: number;
      website?: string;
      profile_picture_url?: string;
    };
  };
  const found = data.business_discovery;
  if (!found) return [];

  const influencer = toInfluencer(
    {
      id: found.id,
      username: found.username,
      fullName: found.name,
      biography: found.biography,
      followersCount: found.followers_count,
      externalUrl: found.website,
      profilePicUrl: found.profile_picture_url,
    },
    query,
    "instagram-graph",
  );
  return influencer ? [influencer] : [];
}

export async function searchInfluencers(
  query: SearchQuery,
): Promise<{ provider: ProviderName; influencers: Influencer[]; notice?: string }> {
  const provider = activeProvider();
  try {
    if (provider === "instagram-graph") {
      const influencers = await graphSearch(query);
      return {
        provider,
        influencers,
        notice: influencers.length
          ? undefined
          : "Instagram Graph business discovery resolves one handle at a time — type an exact @username.",
      };
    }
  } catch (error) {
    return {
      provider: "mock",
      influencers: mockSearch(query),
      notice: `${provider} provider failed (${(error as Error).message}); showing sample data.`,
    };
  }

  return {
    provider: "mock",
    influencers: mockSearch(query),
    notice: "No scraping credentials configured — showing generated sample data. See README.",
  };
}
