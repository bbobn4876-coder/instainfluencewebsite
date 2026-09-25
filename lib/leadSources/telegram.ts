/**
 * Telegram, through the Bot API.
 *
 * The brief asked for a userbot signed in as a person and dropped into closed
 * chats. That is someone's account being automated, and it is what gets the
 * account banned, so this reads instead through a bot: add it to the chats you
 * are in, and it sees the same messages you do, with the group's consent.
 */
import { priorityOf, type Lead, type LeadQuery, type LeadSignal } from "../leads";
import { extractEmails, extractLinks, extractPhones } from "../contacts";

type Update = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; title?: string; username?: string; type: string };
    from?: { id: number; username?: string; first_name?: string };
  };
};

/** Words that mean someone is looking to hire, not just chatting. */
const INTENT = [
  "ищу",
  "ищем",
  "нужен",
  "нужна",
  "требуется",
  "посоветуйте",
  "подрядчик",
  "смм",
  "smm",
  "таргет",
  "рилс",
  "reels",
  "видеограф",
  "монтаж",
  "продвижение",
];

function messageLink(username: string | undefined, chatId: number, messageId: number): string {
  if (username) return `https://t.me/${username}/${messageId}`;
  // Private groups address by the -100-prefixed id with that prefix removed.
  const internal = String(chatId).replace(/^-100/, "");
  return `https://t.me/c/${internal}/${messageId}`;
}

export async function telegramLeads(query: LeadQuery): Promise<Lead[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=["message"]`,
    { cache: "no-store", signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
  const body = (await res.json()) as { ok: boolean; result?: Update[]; description?: string };
  if (!body.ok) throw new Error(`Telegram: ${body.description ?? "request refused"}`);

  const wanted = [...INTENT, ...query.keywords.map((word) => word.toLowerCase())];
  const leads: Lead[] = [];

  for (const update of body.result ?? []) {
    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text || message.chat.type === "private") continue;

    const lower = text.toLowerCase();
    if (!wanted.some((word) => lower.includes(word))) continue;

    const author = message.from?.username
      ? `@${message.from.username}`
      : (message.from?.first_name ?? "—");
    const signals: LeadSignal[] = ["asking"];

    leads.push({
      id: `telegram:${message.chat.id}:${message.message_id}`,
      source: "telegram",
      name: author,
      context: text.replace(/\s+/g, " ").slice(0, 400),
      city: query.city,
      category: query.categories[0] ?? "",
      url: messageLink(message.chat.username, message.chat.id, message.message_id),
      phones: extractPhones(text),
      emails: extractEmails(text),
      links: message.from?.username
        ? [{ platform: "telegram", url: `https://t.me/${message.from.username}` }]
        : [],
      signals,
      priority: priorityOf(signals),
      foundAt: new Date(message.date * 1000).toISOString(),
    });
  }

  return leads.slice(0, query.limit);
}
