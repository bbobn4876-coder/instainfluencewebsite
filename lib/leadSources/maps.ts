/**
 * Local businesses from 2GIS's catalog API — the published route, with a key,
 * rather than scraping the map.
 *
 * A company with a good rating, a phone and no social link is the lead the
 * brief is after: established enough to pay, invisible enough to need help.
 */
import { priorityOf, type Lead, type LeadQuery, type LeadSignal } from "../leads";

const API = "https://catalog.api.2gis.com/3.0/items";

type Item = {
  id: string;
  name: string;
  address_name?: string;
  reviews?: { general_rating?: number; general_review_count?: number };
  contact_groups?: {
    contacts?: { type: string; value?: string; url?: string; text?: string }[];
  }[];
};

const SOCIAL = new Set(["instagram", "telegram", "vkontakte", "vk", "facebook", "youtube"]);

/** Splits a company's contacts into the parts the page shows. */
function contactsOf(item: Item) {
  const phones: string[] = [];
  const emails: string[] = [];
  const links: { platform: string; url: string }[] = [];

  for (const group of item.contact_groups ?? []) {
    for (const contact of group.contacts ?? []) {
      const value = contact.value ?? contact.text ?? contact.url ?? "";
      if (!value) continue;
      if (contact.type === "phone") phones.push(value);
      else if (contact.type === "email") emails.push(value);
      else if (SOCIAL.has(contact.type)) {
        links.push({ platform: contact.type, url: contact.url ?? value });
      } else if (contact.type === "website") links.push({ platform: "website", url: contact.url ?? value });
    }
  }
  return { phones, emails, links };
}

export async function mapsLeads(query: LeadQuery): Promise<Lead[]> {
  const key = process.env.DGIS_API_KEY;
  if (!key) return [];

  const term = [query.categories[0], ...query.keywords].filter(Boolean).join(" ") || "услуги";
  const url = new URL(API);
  url.searchParams.set("q", `${term} ${query.city}`.trim());
  url.searchParams.set("page_size", String(Math.min(50, query.limit)));
  url.searchParams.set("fields", "items.contact_groups,items.reviews,items.address");
  url.searchParams.set("key", key);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`2GIS ${res.status}`);
  const body = (await res.json()) as { result?: { items?: Item[] } };

  return (body.result?.items ?? []).map((item) => {
    const { phones, emails, links } = contactsOf(item);
    const rating = item.reviews?.general_rating ?? 0;
    const social = links.filter((link) => SOCIAL.has(link.platform));

    const signals: LeadSignal[] = [];
    if (social.length === 0) signals.push("noSocial");
    if (rating >= 4.2 && (item.reviews?.general_review_count ?? 0) >= 20) signals.push("highRating");

    return {
      id: `maps:${item.id}`,
      source: "maps" as const,
      name: item.name,
      context: [item.address_name, rating ? `рейтинг ${rating.toFixed(1)}` : ""]
        .filter(Boolean)
        .join(" · "),
      city: query.city,
      category: query.categories[0] ?? "",
      url: `https://2gis.ru/firm/${item.id}`,
      phones,
      emails,
      links,
      signals,
      priority: priorityOf(signals),
      foundAt: new Date().toISOString(),
    };
  });
}
