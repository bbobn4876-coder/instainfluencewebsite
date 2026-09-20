import { NextResponse } from "next/server";
import { readSettings, toPublicSettings, writeSettings, type AppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(toPublicSettings(await readSettings()));
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const current = await readSettings();
  const email = (payload.email ?? {}) as Record<string, unknown>;
  const imap = (payload.imap ?? {}) as Record<string, unknown>;
  const accounts = (payload.accounts ?? {}) as Record<string, unknown>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" ? value.trim() : fallback;

  const next: AppSettings = {
    language: payload.language === "ru" ? "ru" : "en",
    email: {
      host: str(email.host, current.email.host),
      port: Number(email.port) > 0 ? Number(email.port) : current.email.port,
      user: str(email.user, current.email.user),
      // An empty password field means "keep the stored one".
      pass: typeof email.pass === "string" && email.pass !== "" ? email.pass : current.email.pass,
      from: str(email.from, current.email.from),
      replyTo: str(email.replyTo, current.email.replyTo),
    },
    imap: {
      host: str(imap.host, current.imap.host),
      port: Number(imap.port) > 0 ? Number(imap.port) : current.imap.port,
      user: str(imap.user, current.imap.user),
      pass: typeof imap.pass === "string" && imap.pass !== "" ? imap.pass : current.imap.pass,
    },
    telegramBotToken:
      typeof payload.telegramBotToken === "string" && payload.telegramBotToken !== ""
        ? payload.telegramBotToken.trim()
        : current.telegramBotToken,
    accounts: {
      instagram: str(accounts.instagram, current.accounts.instagram),
      telegram: str(accounts.telegram, current.accounts.telegram),
      tiktok: str(accounts.tiktok, current.accounts.tiktok),
      youtube: str(accounts.youtube, current.accounts.youtube),
      website: str(accounts.website, current.accounts.website),
    },
  };

  await writeSettings(next);
  return NextResponse.json(toPublicSettings(next));
}

/** Disconnects every saved account, keeping only the chosen language. */
export async function DELETE() {
  const current = await readSettings();
  const cleared: AppSettings = {
    language: current.language,
    email: { host: "", port: 587, user: "", pass: "", from: "", replyTo: "" },
    imap: { host: "", port: 993, user: "", pass: "" },
    accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
    telegramBotToken: "",
  };
  await writeSettings(cleared);
  return NextResponse.json(toPublicSettings(cleared));
}
