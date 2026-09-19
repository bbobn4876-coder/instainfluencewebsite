import { extractEmails, extractLinks, extractPhones } from "./contacts";
import { mockSearch } from "./mock";
import type { Influencer, SearchQuery } from "./types";

export type ProviderName = "mock" | "apify" | "instagram-graph";

export function activeProvider(): ProviderName {
  if (process.env.APIFY_TOKEN) return "apify";
  if (process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID) return "instagram-graph";
  return "mock";
}

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
};

function toInfluencer(item: ApifyItem, query: SearchQuery, source: Influencer["source"]): Influencer | null {
  if (!item.username) return null;
  const bio = item.biography ?? "";
  return {
    id: `${source}:${item.id ?? item.username}`,
    username: item.username,
    fullName: item.fullName ?? item.username,
    biography: bio,
    followers: item.followersCount ?? 0,
    engagementRate: 0,
    country: query.country,
    category: item.businessCategoryName ?? query.category ?? "lifestyle",
    avatarUrl: item.profilePicUrl,
    profileUrl: `https://instagram.com/${item.username}`,
    emails: extractEmails(bio, item.businessEmail),
    phones: extractPhones(bio, item.businessPhoneNumber),
    links: extractLinks(bio, item.externalUrl),
    source,
  };
}

/**
 * Apify Instagram scraper. Set APIFY_TOKEN (and optionally APIFY_ACTOR_ID) to use
 * real profile data; the actor is run synchronously and its dataset returned.
 */
async function apifySearch(query: SearchQuery): Promise<Influencer[]> {
  const token = process.env.APIFY_TOKEN!;
  const actor = process.env.APIFY_ACTOR_ID ?? "apify~instagram-scraper";
  const limit = Math.min(query.limit ?? 24, 100);
  const terms = [query.keyword, query.category, query.country].filter(Boolean).join(" ");

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        search: terms,
        searchType: "user",
        searchLimit: limit,
        resultsType: "details",
        resultsLimit: limit,
        addParentData: false,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) throw new Error(`Apify request failed: ${res.status} ${await res.text()}`);
  const items = (await res.json()) as ApifyItem[];
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
    if (provider === "apify") {
      return { provider, influencers: await apifySearch(query) };
    }
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
