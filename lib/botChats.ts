/**
 * What the bot remembers per chat, and how a chat is tied to an account.
 *
 * A chat on its own is nobody: searches cost money and count against a plan, so
 * the bot only searches once someone has pasted a one-time code from the Leads
 * page. That proves the chat belongs to a signed-in account, without ever asking
 * for a password in Telegram.
 */
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { databaseConfigured, query } from "./db";
import { LEAD_CATEGORIES, type LeadSource } from "./leads";

export type BotChat = {
  chatId: string;
  /** The linked account, or null while the chat is still anonymous. */
  userId: string | null;
  /** Who linked it, for the panel on the page. */
  title: string;
  city: string;
  categories: string[];
  keywords: string[];
  sources: LeadSource[];
  /** How many leads a /leads run sends. */
  limit: number;
  linkedAt: string | null;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const CHATS_FILE = path.join(DATA_DIR, "botChats.json");
const CODES_FILE = path.join(DATA_DIR, "botCodes.json");

const CODE_TTL_MS = 15 * 60 * 1000;

export function defaultChat(chatId: string): BotChat {
  return {
    chatId,
    userId: null,
    title: "",
    city: "Санкт-Петербург",
    categories: [LEAD_CATEGORIES[0]],
    keywords: [],
    sources: ["vk", "telegram", "maps", "instagram"],
    limit: 10,
    linkedAt: null,
  };
}

function normalize(chatId: string, stored: Partial<BotChat>): BotChat {
  const base = defaultChat(chatId);
  return {
    ...base,
    ...stored,
    chatId,
    categories: Array.isArray(stored.categories) ? stored.categories : base.categories,
    keywords: Array.isArray(stored.keywords) ? stored.keywords : base.keywords,
    sources: Array.isArray(stored.sources) ? stored.sources : base.sources,
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export async function getChat(chatId: string): Promise<BotChat> {
  if (databaseConfigured()) {
    const rows = await query<{ user_id: string | null; data: Partial<BotChat> }>(
      "SELECT user_id, data FROM bot_chats WHERE chat_id = $1",
      [chatId],
    );
    const row = rows[0];
    if (!row) return defaultChat(chatId);
    return normalize(chatId, { ...row.data, userId: row.user_id });
  }
  const map = await readJson<Record<string, Partial<BotChat>>>(CHATS_FILE, {});
  return map[chatId] ? normalize(chatId, map[chatId]) : defaultChat(chatId);
}

export async function saveChat(chat: BotChat): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `INSERT INTO bot_chats (chat_id, user_id, data) VALUES ($1, $2, $3)
       ON CONFLICT (chat_id) DO UPDATE SET user_id = $2, data = $3`,
      [chat.chatId, chat.userId, JSON.stringify(chat)],
    );
    return;
  }
  const map = await readJson<Record<string, Partial<BotChat>>>(CHATS_FILE, {});
  map[chat.chatId] = chat;
  await writeJson(CHATS_FILE, map);
}

/** Every chat linked to an account, for the panel that lists and unlinks them. */
export async function chatsOf(userId: string): Promise<BotChat[]> {
  if (databaseConfigured()) {
    const rows = await query<{ chat_id: string; data: Partial<BotChat> }>(
      "SELECT chat_id, data FROM bot_chats WHERE user_id = $1",
      [userId],
    );
    return rows.map((row) => normalize(row.chat_id, { ...row.data, userId }));
  }
  const map = await readJson<Record<string, Partial<BotChat>>>(CHATS_FILE, {});
  return Object.entries(map)
    .filter(([, chat]) => chat.userId === userId)
    .map(([chatId, chat]) => normalize(chatId, chat));
}

export async function unlinkChat(chatId: string, userId: string): Promise<boolean> {
  const chat = await getChat(chatId);
  if (chat.userId !== userId) return false;
  await saveChat({ ...chat, userId: null, linkedAt: null });
  return true;
}

/* ---------------------------------------------------------------- linking */

type Code = { code: string; userId: string; expiresAt: number };

/** Ambiguous characters are left out so a code can be read off the screen. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Mints a short-lived code the user pastes to the bot as /link CODE. */
export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: number }> {
  const code = newCode();
  const expiresAt = Date.now() + CODE_TTL_MS;

  if (databaseConfigured()) {
    await query("DELETE FROM bot_link_codes WHERE user_id = $1 OR expires_at < $2", [
      userId,
      Date.now(),
    ]);
    await query("INSERT INTO bot_link_codes (code, user_id, expires_at) VALUES ($1, $2, $3)", [
      code,
      userId,
      expiresAt,
    ]);
    return { code, expiresAt };
  }

  const codes = (await readJson<Code[]>(CODES_FILE, [])).filter(
    (one) => one.expiresAt > Date.now() && one.userId !== userId,
  );
  codes.push({ code, userId, expiresAt });
  await writeJson(CODES_FILE, codes);
  return { code, expiresAt };
}

/** Spends a code and returns the account it belonged to. Single use. */
export async function redeemLinkCode(code: string): Promise<string | null> {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return null;

  if (databaseConfigured()) {
    const rows = await query<{ user_id: string; expires_at: string }>(
      "DELETE FROM bot_link_codes WHERE code = $1 RETURNING user_id, expires_at",
      [wanted],
    );
    const row = rows[0];
    if (!row || Number(row.expires_at) < Date.now()) return null;
    return row.user_id;
  }

  const codes = await readJson<Code[]>(CODES_FILE, []);
  const found = codes.find((one) => one.code === wanted);
  await writeJson(
    CODES_FILE,
    codes.filter((one) => one.code !== wanted && one.expiresAt > Date.now()),
  );
  if (!found || found.expiresAt < Date.now()) return null;
  return found.userId;
}
