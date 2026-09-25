/**
 * Stand-in leads, so the page can be used and judged before any of the source
 * credentials exist. Marked as sample wherever it is shown.
 */
import { priorityOf, type Lead, type LeadQuery, type LeadSource } from "../leads";

const SEEDS: Array<Omit<Lead, "id" | "priority" | "foundAt" | "city" | "category">> = [
  {
    source: "vk",
    name: "vk.com/id184920",
    context: "Открываем вторую кофейню, ищем человека на ведение соцсетей и съёмку рилс. Бюджет обсудим.",
    url: "https://vk.com/wall184920_1",
    phones: ["+7 921 000-11-22"],
    emails: [],
    links: [],
    signals: ["asking"],
  },
  {
    source: "telegram",
    name: "@marina_studio",
    context: "Посоветуйте подрядчика по смм для студии маникюра, нужен и монтаж коротких видео.",
    url: "https://t.me/spb_business/48201",
    phones: [],
    emails: [],
    links: [{ platform: "telegram", url: "https://t.me/marina_studio" }],
    signals: ["asking"],
  },
  {
    source: "maps",
    name: "Ресторан «Северный»",
    context: "наб. реки Фонтанки, 24 · рейтинг 4.6",
    url: "https://2gis.ru/firm/70000001006123456",
    phones: ["+7 812 244-55-66"],
    emails: ["hello@severniy.example"],
    links: [{ platform: "website", url: "https://severniy.example" }],
    signals: ["noSocial", "highRating"],
  },
  {
    source: "instagram",
    name: "Beauty Room SPB",
    context: "Салон красоты · Санкт-Петербург · запись в директ",
    url: "https://instagram.com/beautyroom.spb",
    phones: [],
    emails: ["br.spb@example.com"],
    links: [{ platform: "instagram", url: "https://instagram.com/beautyroom.spb" }],
    signals: ["stale", "noVideo", "highRating"],
  },
  {
    source: "vk",
    name: "Фитнес-клуб «Тонус»",
    context: "Последний пост 64 дн. назад",
    url: "https://vk.com/tonus_club",
    phones: [],
    emails: [],
    links: [],
    signals: ["stale", "highRating"],
  },
];

export function sampleLeads(query: LeadQuery): Lead[] {
  const wanted = new Set<LeadSource>(query.sources);
  return SEEDS.filter((seed) => wanted.has(seed.source))
    .slice(0, query.limit)
    .map((seed, index) => ({
      ...seed,
      id: `sample:${seed.source}:${index}`,
      city: query.city || "Санкт-Петербург",
      category: query.categories[0] ?? "",
      priority: priorityOf(seed.signals),
      foundAt: new Date(Date.now() - index * 3_600_000).toISOString(),
    }));
}
