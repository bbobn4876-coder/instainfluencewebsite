/**
 * Local businesses on Instagram, through the same paid API the creator search
 * already uses.
 *
 * The brief described duplicate accounts, rotated session cookies and proxies
 * to get past Instagram's limits. That is circumvention, and it is what loses
 * the accounts doing it; this asks a provider that is allowed to answer.
 */
import { hashtagPage, profile, type HikerProfile } from "../hiker";
import { extractEmails, extractLinks, extractPhones } from "../contacts";
import { priorityOf, type Lead, type LeadQuery, type LeadSignal } from "../leads";

/** Profiles read per run; each one is a billed request. */
const PROFILE_BUDGET = Number(process.env.LEADS_IG_PROFILES ?? 40);

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9а-я]/gi, "");

/** City plus trade is what a local business actually tags itself with. */
function tagsFor(query: LeadQuery): string[] {
  const city = clean(query.city);
  const tags = new Set<string>();
  for (const category of query.categories.length ? query.categories : ["business"]) {
    const base = clean(category);
    if (!base) continue;
    tags.add(base);
    if (city) tags.add(`${city}${base}`);
  }
  for (const word of query.keywords) {
    const term = clean(word);
    if (term) tags.add(city ? `${city}${term}` : term);
  }
  return [...tags].filter(Boolean).slice(0, 6);
}

/** A business account worth writing to: real, not huge, and short of content. */
function toLead(item: HikerProfile, query: LeadQuery): Lead | null {
  // Below this it is a personal page; above it they have an agency already.
  if (item.followers < 300 || item.followers > 120_000) return null;

  const bio = item.biography ?? "";
  const signals: LeadSignal[] = [];
  if (!item.medianLikes && !item.medianComments) signals.push("stale");
  // The profile read carries no reel figure, so a page with no engagement at
  // all is the closest honest reading of "nothing is being posted".
  if (!item.medianComments) signals.push("noVideo");
  if (item.followers >= 2000) signals.push("highRating");
  if (signals.length === 0) return null;

  return {
    id: `instagram:${item.id}`,
    source: "instagram",
    name: item.fullName || `@${item.username}`,
    context: bio.replace(/\s+/g, " ").slice(0, 300),
    city: query.city,
    category: item.category ?? query.categories[0] ?? "",
    url: `https://instagram.com/${item.username}`,
    phones: extractPhones(bio, item.phone),
    emails: extractEmails(bio, item.email),
    links: extractLinks(bio, item.externalUrl),
    signals,
    priority: priorityOf(signals),
    foundAt: new Date().toISOString(),
  };
}

export async function instagramLeads(query: LeadQuery): Promise<Lead[]> {
  if (!process.env.HIKER_TOKEN) return [];

  const tags = tagsFor(query);
  const usernames = new Set<string>();
  for (const tag of tags) {
    if (usernames.size >= PROFILE_BUDGET) break;
    try {
      const page = await hashtagPage(tag, undefined, "recent");
      for (const post of page.posts) {
        if (usernames.size >= PROFILE_BUDGET) break;
        usernames.add(post.username);
      }
    } catch {
      // A dead tag must not sink the run; the others still answer.
    }
  }

  const leads: Lead[] = [];
  for (const username of usernames) {
    if (leads.length >= query.limit) break;
    try {
      const found = await profile(username);
      const lead = found ? toLead(found, query) : null;
      if (lead) leads.push(lead);
    } catch {
      continue;
    }
  }
  return leads;
}
