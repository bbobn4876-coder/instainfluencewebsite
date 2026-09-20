import { promises as fs } from "fs";
import path from "path";
import { databaseConfigured, query } from "./db";

export type Language = "en" | "ru";

export type EmailSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  replyTo: string;
};

export type ImapSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export type SocialAccounts = {
  instagram: string;
  telegram: string;
  tiktok: string;
  youtube: string;
  website: string;
};

export type AppSettings = {
  language: Language;
  email: EmailSettings;
  imap: ImapSettings;
  accounts: SocialAccounts;
  /** Bot token used to read the Telegram inbox. */
  telegramBotToken: string;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");

/** Every account keeps its own mail credentials and handles. */
function settingsFile(userId: string): string {
  return path.join(DATA_DIR, "users", `${userId}.json`);
}

function defaults(): AppSettings {
  return {
    language: "en",
    email: {
      host: process.env.SMTP_HOST ?? "",
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
      from: process.env.SMTP_FROM ?? "",
      replyTo: "",
    },
    imap: {
      host: process.env.IMAP_HOST ?? "",
      port: Number(process.env.IMAP_PORT ?? 993),
      user: process.env.IMAP_USER ?? "",
      pass: process.env.IMAP_PASS ?? "",
    },
    accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  };
}

async function loadStored(userId: string): Promise<Partial<AppSettings> | null> {
  if (databaseConfigured()) {
    const rows = await query<{ data: Partial<AppSettings> }>(
      "SELECT data FROM settings WHERE user_id = $1",
      [userId],
    );
    return rows[0]?.data ?? null;
  }
  try {
    return JSON.parse(await fs.readFile(settingsFile(userId), "utf8")) as Partial<AppSettings>;
  } catch {
    return null;
  }
}

export async function readSettings(userId: string): Promise<AppSettings> {
  const base = defaults();
  try {
    const stored = await loadStored(userId);
    if (!stored) return base;
    return {
      language: stored.language === "ru" ? "ru" : "en",
      // Stored values win over the env fallbacks, but only where they are set.
      email: { ...base.email, ...(stored.email ?? {}) },
      imap: { ...base.imap, ...(stored.imap ?? {}) },
      accounts: { ...base.accounts, ...(stored.accounts ?? {}) },
      telegramBotToken: stored.telegramBotToken ?? base.telegramBotToken,
    };
  } catch {
    return base;
  }
}

export async function writeSettings(userId: string, next: AppSettings): Promise<void> {
  if (databaseConfigured()) {
    await query(
      "INSERT INTO settings (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = $2",
      [userId, JSON.stringify(next)],
    );
    return;
  }
  await fs.mkdir(path.join(DATA_DIR, "users"), { recursive: true });
  await fs.writeFile(settingsFile(userId), JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** Removes an account's stored credentials along with the account itself. */
export async function deleteSettings(userId: string): Promise<void> {
  if (databaseConfigured()) {
    // The foreign key already cascades; this covers a direct call too.
    await query("DELETE FROM settings WHERE user_id = $1", [userId]);
    return;
  }
  try {
    await fs.unlink(settingsFile(userId));
  } catch {
    /* nothing was ever saved for this account */
  }
}

/** The password never leaves the server; the client only learns whether one is stored. */
export function toPublicSettings(settings: AppSettings) {
  const { pass, ...email } = settings.email;
  const { pass: imapPass, ...imap } = settings.imap;
  return {
    language: settings.language,
    email: { ...email, hasPassword: pass.length > 0 },
    imap: { ...imap, hasPassword: imapPass.length > 0 },
    accounts: settings.accounts,
    hasTelegramBot: settings.telegramBotToken.length > 0,
  };
}

export type PublicSettings = ReturnType<typeof toPublicSettings>;

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").replace(/\s+/g, "");
}
