import { promises as fs } from "fs";
import path from "path";

export type Language = "en" | "ru";

export type EmailSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  replyTo: string;
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
  accounts: SocialAccounts;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

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
    accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
  };
}

export async function readSettings(): Promise<AppSettings> {
  const base = defaults();
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return {
      language: stored.language === "ru" ? "ru" : "en",
      // Stored values win over the env fallbacks, but only where they are set.
      email: { ...base.email, ...(stored.email ?? {}) },
      accounts: { ...base.accounts, ...(stored.accounts ?? {}) },
    };
  } catch {
    return base;
  }
}

export async function writeSettings(next: AppSettings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** The password never leaves the server; the client only learns whether one is stored. */
export function toPublicSettings(settings: AppSettings) {
  const { pass, ...email } = settings.email;
  return {
    language: settings.language,
    email: { ...email, hasPassword: pass.length > 0 },
    accounts: settings.accounts,
  };
}

export type PublicSettings = ReturnType<typeof toPublicSettings>;

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").replace(/\s+/g, "");
}
