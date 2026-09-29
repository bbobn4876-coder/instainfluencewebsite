/**
 * The Telegram side of the Leads tool: a bot that runs the same searches the
 * page runs and sends the results into a chat.
 *
 * The token comes from the environment, so it can be pasted into the host's
 * variables after deploy without touching any code. Nothing here needs a token
 * at build time; every call reports plainly when one is missing.
 */
import crypto from "crypto";
import { LEAD_SOURCES, MODULES, type Lead, type LeadSource } from "./leads";

/**
 * LEADS_BOT_TOKEN when the lead bot is its own bot, otherwise the token the
 * Telegram inbox already uses.
 */
export function botToken(): string | undefined {
  return process.env.LEADS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || undefined;
}

export function botConfigured(): boolean {
  return Boolean(botToken());
}

/**
 * The secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token, so a
 * stranger who guesses the webhook path still cannot post updates to it. It is
 * derived from the token, so there is no second variable to set — and it
 * changes with the token, which is what you want if the token ever leaks.
 */
export function webhookSecret(): string {
  const token = botToken();
  if (!token) return "";
  return crypto.createHash("sha256").update(`loomera-webhook:${token}`).digest("hex").slice(0, 48);
}

type BotResult<T> = { ok: true; result: T } | { ok: false; error: string };

async function call<T>(method: string, body?: unknown): Promise<BotResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "No bot token is set." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!payload.ok) return { ok: false, error: payload.description ?? `Telegram ${res.status}` };
    return { ok: true, result: payload.result as T };
  } catch (error) {
    // A blocked network or a body that is not JSON both mean the same thing
    // from here, and the raw message reads like a bug in the page.
    const reason = (error as Error).name === "TimeoutError" ? "timed out" : "is unreachable";
    return { ok: false, error: `Telegram ${reason} from the server.` };
  }
}

export type BotIdentity = { id: number; username?: string; first_name?: string };

export function getMe() {
  return call<BotIdentity>("getMe");
}

export type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
};

export function getWebhookInfo() {
  return call<WebhookInfo>("getWebhookInfo");
}

export function setWebhook(url: string) {
  return call<boolean>("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function deleteWebhook() {
  return call<boolean>("deleteWebhook", { drop_pending_updates: true });
}

export type InlineKeyboard = { text: string; callback_data: string }[][];

export function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return call<unknown>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function answerCallbackQuery(id: string, text?: string) {
  return call<boolean>("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SOURCE_NAMES: Record<LeadSource, string> = {
  avito: "Авито",
  telegram: "Telegram",
  vk: "ВКонтакте",
  maps: "2ГИС / Карты",
  instagram: "Instagram",
};

const SIGNAL_NAMES: Record<string, string> = {
  asking: "ищет подрядчика",
  stale: "лента заброшена",
  noVideo: "нет видео",
  noSocial: "нет соцсетей",
  highRating: "устойчивый бизнес",
};

export function sourceName(id: LeadSource): string {
  return SOURCE_NAMES[id];
}

/** One lead as a Telegram message: who they are, why, and how to reach them. */
export function formatLead(lead: Lead, index: number, total: number): string {
  const lines = [
    `<b>${escapeHtml(lead.name)}</b> · ${lead.priority}/100`,
    `${SOURCE_NAMES[lead.source]}${lead.city ? ` · ${escapeHtml(lead.city)}` : ""}`,
  ];
  if (lead.context) lines.push("", escapeHtml(lead.context.slice(0, 500)));

  const signals = lead.signals.map((signal) => SIGNAL_NAMES[signal] ?? signal);
  if (signals.length) lines.push("", `🎯 ${escapeHtml(signals.join(", "))}`);

  const contacts: string[] = [
    ...lead.emails.map((email) => `✉️ ${escapeHtml(email)}`),
    ...lead.phones.map((phone) => `📞 ${escapeHtml(phone)}`),
  ];
  if (contacts.length) lines.push("", ...contacts);

  if (lead.url) lines.push("", `<a href="${escapeHtml(lead.url)}">Открыть</a>`);
  for (const link of lead.links.slice(0, 3)) {
    lines.push(`${escapeHtml(link.platform)}: ${escapeHtml(link.url)}`);
  }
  lines.push("", `<i>${index + 1} из ${total}</i>`);
  return lines.join("\n");
}

/** The picker that toggles sources, two per row, with the current state shown. */
export function sourceKeyboard(selected: LeadSource[]): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (const id of LEAD_SOURCES) {
    const blocked = Boolean(MODULES[id].unavailable);
    const mark = blocked ? "🚫" : selected.includes(id) ? "✅" : "▫️";
    const row = rows[rows.length - 1];
    const button = { text: `${mark} ${SOURCE_NAMES[id]}`, callback_data: `src:${id}` };
    if (row && row.length < 2) row.push(button);
    else rows.push([button]);
  }
  rows.push([{ text: "Искать", callback_data: "run" }]);
  return rows;
}
