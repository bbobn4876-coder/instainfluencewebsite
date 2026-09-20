import { ALL, countryByCode } from "./countries";
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

function toInfluencer(item: ApifyItem, query: SearchQuery, source: Influencer["source"]): Influencer | null {
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
    country: query.countries.includes(ALL) ? "" : (query.countries[0] ?? ""),
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
export type ApifyRun = { runId: string; datasetId: string; stage: ApifyStage };

/** How many hashtag posts to scan for candidates before fetching their profiles. */
const CANDIDATE_POOL = Number(process.env.APIFY_CANDIDATE_POOL ?? 240);

/** Keeps every call well inside a serverless function's time limit. */
async function apifyFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`Apify ${res.status}: ${detail}`);
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

/** Hashtags to scan: the niches themselves, the keyword, and city+niche combinations. */
function discoveryTags(query: SearchQuery): string[] {
  const niches = query.categories?.includes(ALL)
    ? ["influencer", "creator"]
    : (query.categories ?? ["lifestyle"]);
  const cities = query.countries.includes(ALL)
    ? []
    : query.countries.flatMap((code) => countryByCode(code)?.cities.slice(0, 2) ?? []);

  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tags = new Set<string>();

  if (query.keyword?.trim()) tags.add(clean(query.keyword));
  for (const niche of niches) {
    tags.add(clean(niche));
    // City tags are where smaller, local creators actually show up.
    for (const city of cities) tags.add(`${clean(city)}${clean(niche)}`);
  }
  return [...tags].filter(Boolean).slice(0, 8);
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
      resultsLimit: Math.max(CANDIDATE_POOL, (query.limit ?? 24) * 4),
      searchLimit: 0,
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
      searchLimit: 0,
    },
    "details",
  );
}

export type RunStatus =
  | { status: "running"; run: ApifyRun; scanned?: number }
  | { status: "done"; influencers: Influencer[]; scanned: number; matched: number }
  | { status: "failed"; detail: string };

async function datasetItems<T>(datasetId: string, limit: number): Promise<T[]> {
  const token = encodeURIComponent(process.env.APIFY_TOKEN!);
  const res = await apifyFetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`,
  );
  return (await res.json()) as T[];
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
    const posts = await datasetItems<{ ownerUsername?: string }>(run.datasetId, CANDIDATE_POOL);
    const usernames = [...new Set(posts.map((p) => p.ownerUsername).filter(Boolean))] as string[];
    if (usernames.length === 0) {
      return { status: "failed", detail: "No accounts found under those hashtags." };
    }
    // Apify bills per profile, so cap how many are looked up in detail.
    const capped = usernames.slice(0, Math.min(CANDIDATE_POOL, 150));
    return { status: "running", run: await startDetailsRun(capped), scanned: capped.length };
  }

  const items = await datasetItems<ApifyItem>(run.datasetId, 200);
  const all = items
    .map((item) => toInfluencer(item, query, "apify"))
    .filter((i): i is Influencer => i !== null);
  const matched = shapeApifyItems(items, query);
  return {
    status: "done",
    influencers: matched.slice(0, query.limit ?? 24),
    scanned: all.length,
    matched: matched.length,
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
