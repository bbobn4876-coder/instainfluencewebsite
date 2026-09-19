import { countryByCode } from "./countries";
import { extractEmails, extractLinks, extractPhones } from "./contacts";
import type { Influencer, SearchQuery } from "./types";

// Deterministic PRNG so the same query always yields the same sample set.
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["mia", "leo", "nora", "ivan", "sofia", "ruben", "ayla", "noah", "lena", "dario", "kira", "otto", "vera", "milo", "juno", "elias", "iris", "teo", "nika", "ada"];
const LAST = ["harper", "vance", "kowal", "reyes", "durand", "linde", "moretti", "sayed", "novak", "brandt", "okafor", "silva", "halim", "bergman", "petrov"];
const HANDLE_SUFFIX = ["", ".", "_", ".official", "_daily", "studio", "hq", "world"];
const DOMAINS = ["gmail.com", "outlook.com", "icloud.com", "proton.me"];

const BIO_TEMPLATES: Record<string, string[]> = {
  fashion: ["Editorial & street style in {city}", "Slow fashion, styling notes, {city} based"],
  beauty: ["Clean beauty routines · {city}", "Makeup artist, skincare nerd in {city}"],
  fitness: ["Coach in {city} · strength & mobility", "Marathoner, training logs from {city}"],
  travel: ["Field notes from {city} and beyond", "Solo travel, slow routes · {city}"],
  food: ["Home cooking from {city}", "Restaurant diary · {city}"],
  tech: ["Builder in {city} · gadgets & code", "Reviews, teardowns, {city}"],
  gaming: ["Streamer from {city}", "FPS & indie games · {city}"],
  music: ["Producer in {city}", "DJ sets and studio cuts · {city}"],
  lifestyle: ["Everyday things, {city}", "Slow living in {city}"],
  business: ["Founder in {city} · building in public", "Operator notes from {city}"],
};

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function roundFollowers(n: number): number {
  return Math.round(n / 100) * 100;
}

export function mockSearch(query: SearchQuery): Influencer[] {
  const country = countryByCode(query.country);
  if (!country) return [];

  const category = query.category ?? "lifestyle";
  const limit = Math.min(query.limit ?? 24, 60);
  const min = query.minFollowers ?? 5_000;
  const max = Math.max(query.maxFollowers ?? 900_000, min + 1000);
  const rnd = seeded(`${country.code}|${category}|${query.keyword ?? ""}|${min}|${max}`);

  const out: Influencer[] = [];
  const seen = new Set<string>();

  while (out.length < limit) {
    const first = pick(rnd, FIRST);
    const last = pick(rnd, LAST);
    const username = `${first}${pick(rnd, HANDLE_SUFFIX)}${last}`.toLowerCase();
    if (seen.has(username)) continue;
    seen.add(username);

    const city = pick(rnd, country.cities);
    const template = pick(rnd, BIO_TEMPLATES[category] ?? BIO_TEMPLATES.lifestyle);
    const followers = roundFollowers(min + rnd() * (max - min));

    const hasEmail = rnd() > 0.18;
    const email = `${first}.${last}@${pick(rnd, DOMAINS)}`;
    const businessEmail = `collab@${first}${last}.com`;
    const extraLinks: string[] = [];
    if (rnd() > 0.45) extraLinks.push(`tiktok.com/@${username}`);
    if (rnd() > 0.6) extraLinks.push(`youtube.com/@${username}`);
    if (rnd() > 0.75) extraLinks.push(`t.me/${username}`);
    if (rnd() > 0.8) extraLinks.push(`x.com/${username}`);
    if (rnd() > 0.5) extraLinks.push(`linktr.ee/${username}`);

    const bioParts = [
      template.replace("{city}", city),
      hasEmail ? `📩 ${rnd() > 0.5 ? email : businessEmail}` : "DM for collabs",
      ...extraLinks,
    ];
    const biography = bioParts.join("\n");
    const externalUrl = extraLinks.length ? `https://${extraLinks[extraLinks.length - 1]}` : undefined;

    out.push({
      id: `mock:${username}`,
      username,
      fullName: `${first[0].toUpperCase()}${first.slice(1)} ${last[0].toUpperCase()}${last.slice(1)}`,
      biography,
      followers,
      engagementRate: Number((1 + rnd() * 7).toFixed(2)),
      country: country.code,
      city,
      category,
      profileUrl: `https://instagram.com/${username}`,
      emails: extractEmails(biography),
      phones: extractPhones(biography),
      links: extractLinks(biography, externalUrl),
      source: "mock",
    });
  }

  const keyword = query.keyword?.trim().toLowerCase();
  const filtered = keyword
    ? out.filter(
        (i) =>
          i.username.includes(keyword) ||
          i.fullName.toLowerCase().includes(keyword) ||
          i.biography.toLowerCase().includes(keyword),
      )
    : out;

  return filtered.sort((a, b) => b.followers - a.followers);
}
