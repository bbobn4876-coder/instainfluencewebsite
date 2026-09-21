/**
 * HikerAPI (api.hikerapi.com) — a pay-per-request Instagram API.
 *
 * Endpoints and the auth header below are taken from the vendor's own Python
 * client (`hikerapi` on PyPI), not guessed. Responses are read defensively:
 * the v1 endpoints answer in instagrapi's snake_case shape and the v2 ones
 * wrap it, so every field is looked up under the spellings both use.
 */

const HOST = process.env.HIKER_HOST ?? "https://api.hikerapi.com";

export type HikerPost = { username: string; location?: string };
export type HikerProfile = {
  id: string;
  username: string;
  fullName?: string;
  biography?: string;
  followers: number;
  externalUrl?: string;
  avatarUrl?: string;
  email?: string;
  phone?: string;
  category?: string;
  medianLikes?: number;
  medianComments?: number;
};

function token(): string {
  const value = process.env.HIKER_TOKEN;
  if (!value) throw new Error("HIKER_TOKEN is not set.");
  return value;
}

async function get(path: string, params: Record<string, string | undefined>): Promise<unknown> {
  const url = new URL(path, HOST);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-access-key": token() },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    // Always carry the server's own wording: a guessed explanation of a status
    // code sends you looking in the wrong place.
    const body = (await res.text()).slice(0, 200);
    const said = body ? ` Server said: ${body}` : "";
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HikerAPI refused the token (${res.status}). Check HIKER_TOKEN.${said}`);
    }
    if (res.status === 402) {
      throw new Error(
        "HikerAPI has no balance left to draw on. It is prepaid: top the account up " +
          `in the dashboard and the search will run again.${said}`,
      );
    }
    if (res.status === 429) {
      throw new Error(`HikerAPI is rate-limiting this token. Wait a moment and retry.${said}`);
    }
    throw new Error(`HikerAPI ${res.status}: ${body}`);
  }
  return res.json();
}

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** First present key out of several spellings. */
function pick(bag: Bag, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = bag[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The payload may be the object itself, or wrapped in response/user/data. */
function unwrap(value: unknown, ...keys: string[]): Bag | undefined {
  if (!isBag(value)) return undefined;
  for (const key of keys) {
    const inner = value[key];
    if (isBag(inner)) return inner;
  }
  return value;
}

function listOf(value: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isBag(value)) return [];
  for (const key of keys) {
    const inner = value[key];
    if (Array.isArray(inner)) return inner;
    if (isBag(inner)) {
      for (const deeper of keys) {
        if (Array.isArray(inner[deeper])) return inner[deeper] as unknown[];
      }
    }
  }
  return [];
}

function locationOf(post: Bag): string | undefined {
  const location = pick(post, "location", "place");
  if (typeof location === "string") return location;
  if (isBag(location)) {
    const name = str(pick(location, "name", "title", "short_name"));
    const city = str(pick(location, "city", "city_name"));
    return [name, city].filter(Boolean).join(", ") || undefined;
  }
  return undefined;
}

function median(values: number[]): number | undefined {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** One page of a hashtag's posts, plus the cursor for the next page. */
export async function hashtagPage(
  tag: string,
  pageId?: string,
  kind: "recent" | "top" = "recent",
): Promise<{ posts: HikerPost[]; next?: string }> {
  const body = await get(`/v2/hashtag/medias/${kind}`, { name: tag, page_id: pageId });
  const medias = listOf(body, "response", "sections", "medias", "items", "data");
  const posts: HikerPost[] = [];
  for (const entry of medias) {
    const media = unwrap(entry, "media", "node") ?? {};
    const user = unwrap(pick(media, "user", "owner"), "user") ?? {};
    const username = str(pick(user, "username", "user_name"));
    if (username) posts.push({ username, location: locationOf(media) });
  }
  const next = isBag(body) ? str(pick(body, "next_page_id", "next_page", "page_id")) : undefined;
  return { posts, next };
}

/** A profile with its follower count, bio and recent-post medians. */
export async function profile(username: string): Promise<HikerProfile | null> {
  const body = await get("/v1/user/by/username", { username });
  const user = unwrap(body, "user", "response", "data");
  if (!user) return null;
  const name = str(pick(user, "username"));
  if (!name) return null;

  const posts = listOf(user, "latest_posts", "medias", "items");
  const likes = posts.map((p) => num(pick(unwrap(p) ?? {}, "like_count", "likesCount")));
  const comments = posts.map((p) => num(pick(unwrap(p) ?? {}, "comment_count", "commentsCount")));

  return {
    id: str(pick(user, "pk", "pk_id", "id")) ?? name,
    username: name,
    fullName: str(pick(user, "full_name", "fullName")),
    biography: str(pick(user, "biography", "bio")),
    followers: num(pick(user, "follower_count", "followers_count", "followersCount")),
    externalUrl: str(pick(user, "external_url", "externalUrl")),
    avatarUrl: str(pick(user, "profile_pic_url", "profilePicUrl")),
    email: str(pick(user, "public_email", "business_email", "email")),
    phone: str(pick(user, "public_phone_number", "business_phone_number", "contact_phone_number")),
    category: str(pick(user, "category", "category_name", "business_category_name")),
    medianLikes: median(likes),
    medianComments: median(comments),
  };
}

/** Accounts Instagram itself suggests next to this one — the crawl's fuel. */
export async function suggestedProfiles(userId: string): Promise<string[]> {
  const body = await get("/v2/user/suggested/profiles", { user_id: userId });
  const entries = listOf(body, "response", "users", "suggestions", "data", "items");
  const names: string[] = [];
  for (const entry of entries) {
    const bag = unwrap(entry, "user", "node") ?? {};
    const name = str(pick(bag, "username"));
    if (name) names.push(name);
  }
  return names;
}
