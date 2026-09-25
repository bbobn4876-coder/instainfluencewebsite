/**
 * VK, through its own API — the route the brief asks for, and the one that
 * carries no ban risk because nothing is being scraped.
 *
 * Two modes, as specified: search posts where someone is asking for a
 * contractor, and audit local business groups whose wall has gone quiet.
 */
import { priorityOf, type Lead, type LeadQuery, type LeadSignal } from "../leads";
import { extractEmails, extractLinks, extractPhones } from "../contacts";

const API = "https://api.vk.com/method";
const VERSION = "5.199";

/** A wall that has not moved in this long is a business with a problem. */
const STALE_DAYS = 21;

type WallPost = {
  id: number;
  from_id: number;
  owner_id: number;
  date: number;
  text: string;
};

type Group = {
  id: number;
  name: string;
  screen_name?: string;
  city?: { title?: string };
  members_count?: number;
};

async function call<T>(method: string, params: Record<string, string>): Promise<T | null> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) return null;
  const url = new URL(`${API}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  url.searchParams.set("v", VERSION);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`VK ${res.status}`);
  const body = (await res.json()) as { response?: T; error?: { error_msg?: string } };
  if (body.error) throw new Error(`VK: ${body.error.error_msg ?? "request refused"}`);
  return body.response ?? null;
}

const daysSince = (unix: number): number => (Date.now() / 1000 - unix) / 86_400;

/** Mode one: people openly looking for someone to run their social media. */
async function askingPosts(query: LeadQuery): Promise<Lead[]> {
  const phrase = [...query.keywords, query.city].filter(Boolean).join(" ");
  if (!phrase.trim()) return [];

  const found = await call<{ items: WallPost[] }>("newsfeed.search", {
    q: phrase,
    count: String(Math.min(200, query.limit)),
    extended: "0",
  });
  if (!found?.items) return [];

  return found.items
    .filter((post) => post.text.trim().length > 20)
    .map((post) => {
      const owner = post.from_id || post.owner_id;
      const signals: LeadSignal[] = ["asking"];
      return {
        id: `vk:post:${owner}_${post.id}`,
        source: "vk" as const,
        name: `vk.com/id${Math.abs(owner)}`,
        context: post.text.replace(/\s+/g, " ").slice(0, 400),
        city: query.city,
        category: query.categories[0] ?? "",
        url: `https://vk.com/wall${owner}_${post.id}`,
        phones: extractPhones(post.text),
        emails: extractEmails(post.text),
        links: extractLinks(post.text),
        signals,
        priority: priorityOf(signals),
        foundAt: new Date(post.date * 1000).toISOString(),
      };
    });
}

/** Mode two: local businesses whose own page has been left to rot. */
async function neglectedGroups(query: LeadQuery): Promise<Lead[]> {
  const term = [query.categories[0], query.city].filter(Boolean).join(" ");
  if (!term.trim()) return [];

  const found = await call<{ items: Group[] }>("groups.search", {
    q: term,
    type: "group",
    count: String(Math.min(100, query.limit)),
  });
  if (!found?.items) return [];

  const leads: Lead[] = [];
  // One wall read per group; the list is short enough to stay inside the window.
  for (const group of found.items.slice(0, 25)) {
    let wall: { items: WallPost[] } | null = null;
    try {
      wall = await call<{ items: WallPost[] }>("wall.get", {
        owner_id: `-${group.id}`,
        count: "5",
      });
    } catch {
      continue;
    }
    const last = wall?.items?.[0];
    const quiet = !last || daysSince(last.date) > STALE_DAYS;
    const signals: LeadSignal[] = [];
    if (quiet) signals.push("stale");
    if (!last) signals.push("noSocial");
    if ((group.members_count ?? 0) > 500) signals.push("highRating");
    if (signals.length === 0) continue;

    leads.push({
      id: `vk:group:${group.id}`,
      source: "vk",
      name: group.name,
      context: last
        ? `Последний пост ${Math.round(daysSince(last.date))} дн. назад`
        : "На стене нет постов",
      city: group.city?.title ?? query.city,
      category: query.categories[0] ?? "",
      url: `https://vk.com/${group.screen_name ?? `club${group.id}`}`,
      phones: [],
      emails: [],
      links: [],
      signals,
      priority: priorityOf(signals),
      foundAt: new Date().toISOString(),
    });
  }
  return leads;
}

export async function vkLeads(query: LeadQuery): Promise<Lead[]> {
  const [asking, neglected] = await Promise.all([
    askingPosts(query).catch(() => []),
    neglectedGroups(query).catch(() => []),
  ]);
  return [...asking, ...neglected];
}
