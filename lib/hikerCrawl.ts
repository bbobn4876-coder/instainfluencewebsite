/**
 * The same two-stage crawl as the Apify path, but over HikerAPI's per-request
 * endpoints. There is no run to poll here: each call does one round of work
 * inside the serverless window and hands its state back to the client, so the
 * search still streams results in while it widens.
 */
import { ALL } from "./countries";
import { countryOfLocation, placeInText, verdictFor } from "./geo";
import { extractEmails, extractLinks, extractPhones } from "./contacts";
import { hashtagPage, profile, suggestedProfiles, type HikerPost, type HikerProfile } from "./hiker";
import { discoveryTags, type CrawlStats, type GeoHint } from "./crawl";
import type { Influencer, SearchQuery } from "./types";

/** Hashtag pages per discovery round; each is one billed request. */
const TAG_PAGES = Number(process.env.HIKER_TAG_PAGES ?? 40);

/** Profiles per round — kept short so a round answers inside the time limit. */
const PROFILE_BATCH = Number(process.env.HIKER_PROFILE_BATCH ?? 60);

/** Ceiling on the whole crawl. */
const PROFILE_BUDGET = Number(process.env.HIKER_PROFILE_BUDGET ?? 10000);

/** Parallel requests; HikerAPI bills per request, not per second. */
const CONCURRENCY = Number(process.env.HIKER_CONCURRENCY ?? 8);

export type HikerRun = {
  stage: "discover" | "details";
  seen?: string[];
  cursor?: number;
  geo?: Record<string, GeoHint>;
  stats?: CrawlStats;
};

export type HikerStatus =
  | {
      status: "running";
      run: HikerRun;
      scanned: number;
      influencers?: Influencer[];
      /** Profiles read this round, charged against the daily allowance. */
      read?: number;
    }
  | {
      status: "done";
      influencers: Influencer[];
      scanned: number;
      matched: number;
      confirmed: number;
      stats: CrawlStats;
      read?: number;
    }
  | { status: "failed"; detail: string };

/**
 * Runs a job over a list with a fixed number of workers. Failures are kept
 * rather than swallowed: a round where every request failed must not be
 * reported as "nothing found".
 */
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
): Promise<{ results: R[]; errors: string[] }> {
  const results: R[] = [];
  const errors: string[] = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results.push(await worker(items[index]));
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
  });
  await Promise.all(runners);
  return { results, errors };
}

function toInfluencer(item: HikerProfile, query: SearchQuery, geo?: GeoHint): Influencer {
  const bio = item.biography ?? "";
  const engagementRate =
    item.followers > 0 && (item.medianLikes || item.medianComments)
      ? Number((((item.medianLikes ?? 0) + (item.medianComments ?? 0)) / item.followers * 100).toFixed(2))
      : 0;
  return {
    id: `hiker:${item.id}`,
    username: item.username,
    fullName: item.fullName ?? item.username,
    biography: bio,
    followers: item.followers,
    engagementRate,
    medianLikes: item.medianLikes,
    medianComments: item.medianComments,
    medianReelViews: undefined,
    country: geo?.code ?? (query.countries.includes(ALL) ? "" : (query.countries[0] ?? "")),
    city: geo?.place,
    category:
      item.category ??
      (query.categories?.includes(ALL) ? "lifestyle" : (query.categories?.[0] ?? "lifestyle")),
    avatarUrl: item.avatarUrl,
    profileUrl: `https://instagram.com/${item.username}`,
    emails: extractEmails(bio, item.email),
    phones: extractPhones(bio, item.phone),
    links: extractLinks(bio, item.externalUrl),
    source: "apify",
  };
}

/** Stage one: hashtag pages give candidate usernames and where they post. */
async function discover(query: SearchQuery): Promise<HikerStatus> {
  const tags = discoveryTags(query);
  const wanted = query.countries.includes(ALL) ? [] : query.countries;
  // Spread the page budget over the tags rather than draining one of them.
  const pagesPerTag = Math.max(1, Math.round(TAG_PAGES / Math.max(1, tags.length)));

  // Each tag is one job that pages through itself, so its cursor stays in order.
  const { results, errors } = await pooled(tags, async (tag) => {
    const posts: HikerPost[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < pagesPerTag; page += 1) {
      const answer = await hashtagPage(tag, cursor, "recent");
      posts.push(...answer.posts);
      if (!answer.next) break;
      cursor = answer.next;
    }
    // Instagram hides the recent feed of restricted tags (gambling, betting and
    // the like) but still serves top posts, so that is worth one more request.
    if (posts.length === 0) {
      const top = await hashtagPage(tag, undefined, "top");
      posts.push(...top.posts);
    }
    return posts;
  });

  const seenPosts = results.flat();
  if (seenPosts.length === 0) {
    if (errors.length > 0) return { status: "failed", detail: errors[0] };
    return {
      status: "failed",
      detail:
        "Instagram returned no posts for those hashtags. Restricted topics such as " +
        "gambling and betting are often hidden from hashtag pages — try a broader " +
        "niche, or add a keyword that creators in it actually use.",
    };
  }

  const byUser = new Map<string, { hits: Map<string, string>; other: number }>();
  for (const post of seenPosts) {
    const entry = byUser.get(post.username) ?? { hits: new Map(), other: 0 };
    const verdict = wanted.length === 0 ? "unknown" : verdictFor(post.location, wanted);
    if (verdict === "match") {
      entry.hits.set(countryOfLocation(post.location)!, post.location ?? "");
    } else if (verdict === "other") {
      entry.other += 1;
    }
    byUser.set(post.username, entry);
  }

  const confirmed: string[] = [];
  const maybe: string[] = [];
  const geo: Record<string, GeoHint> = {};
  for (const [username, entry] of byUser) {
    if (entry.hits.size > 0) {
      const [code, place] = [...entry.hits.entries()][0];
      geo[username] = { code, place };
      confirmed.push(username);
    } else if (entry.other === 0) {
      maybe.push(username);
    }
  }

  const candidates = [...confirmed, ...maybe].slice(0, PROFILE_BUDGET);
  if (candidates.length === 0) {
    return {
      status: "failed",
      detail: `Every one of the ${seenPosts.length} posts found was tagged outside the chosen geo.`,
    };
  }
  return {
    status: "running",
    run: {
      stage: "details",
      seen: candidates,
      cursor: 0,
      geo,
      stats: { posts: seenPosts.length, candidates: candidates.length, profiles: 0, inBand: 0 },
    },
    scanned: 0,
  };
}

/** Stage two: read a batch of profiles, then snowball from the ones that fit. */
async function details(
  run: HikerRun,
  query: SearchQuery,
  budget: number,
): Promise<HikerStatus> {
  const seen = [...(run.seen ?? [])];
  const cursor = run.cursor ?? 0;
  // Never read more profiles than the plan still allows today.
  const size = Math.max(0, Math.min(PROFILE_BATCH, budget));
  const batch = seen.slice(cursor, cursor + size);
  const hints = { ...(run.geo ?? {}) };
  const wanted = query.countries.includes(ALL) ? [] : query.countries;

  const round = await pooled(batch, (name) => profile(name));
  const fetched = round.results.filter((p): p is HikerProfile => p !== null);
  if (fetched.length === 0 && round.errors.length > 0) {
    return { status: "failed", detail: round.errors[0] };
  }

  // The bio is the second geo source, exactly as on the Apify path.
  const kept: HikerProfile[] = [];
  for (const item of fetched) {
    if (wanted.length > 0 && !hints[item.username]) {
      const found = placeInText(item.biography);
      if (found && !wanted.includes(found.code)) continue;
      if (found) hints[item.username] = found;
    }
    kept.push(item);
  }

  const influencers = kept.map((item) => toInfluencer(item, query, hints[item.username]));
  const matched = influencers
    .filter((i) => i.followers >= (query.minFollowers ?? 0))
    .filter((i) => !query.maxFollowers || i.followers <= query.maxFollowers)
    .sort((a, b) => b.followers - a.followers);

  // Every account in the band suggests more of its own kind.
  const known = new Set(seen);
  const inBand = new Set(matched.map((i) => i.username));
  const seeds = kept.filter((item) => inBand.has(item.username));
  if (seen.length < PROFILE_BUDGET) {
    const suggestions = await pooled(seeds, (item) => suggestedProfiles(item.id));
    for (const names of suggestions.results) {
      for (const name of names) {
        if (known.has(name) || seen.length >= PROFILE_BUDGET) continue;
        known.add(name);
        seen.push(name);
      }
    }
  }

  const before = run.stats ?? { posts: 0, candidates: 0, profiles: 0, inBand: 0 };
  const stats: CrawlStats = {
    posts: before.posts,
    candidates: seen.length,
    profiles: before.profiles + fetched.length,
    inBand: before.inBand + matched.length,
  };
  const nextCursor = cursor + batch.length;

  if (nextCursor < seen.length) {
    return {
      status: "running",
      run: { stage: "details", seen, cursor: nextCursor, geo: hints, stats },
      influencers: matched,
      scanned: stats.profiles,
      read: fetched.length,
    };
  }
  return {
    status: "done",
    influencers: matched,
    scanned: stats.profiles,
    matched: stats.inBand,
    confirmed: matched.filter((i) => i.city).length,
    stats,
    read: fetched.length,
  };
}

/** One round of the crawl; the client calls this until it reports done. */
export async function stepHikerCrawl(
  run: HikerRun | null,
  query: SearchQuery,
  budget: number,
): Promise<HikerStatus> {
  if (!run || run.stage === "discover") return discover(query);
  return details(run, query, budget);
}
