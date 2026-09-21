import { NextResponse } from "next/server";
import {
  readSettings,
  toPublicSettings,
  writeSettings,
  type AppSettings,
  type Mailbox,
  PRIMARY_MAILBOX,
} from "@/lib/settings";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json(toPublicSettings(await readSettings(user.id)));
}

/**
 * The first mailbox comes from the panel that has always edited it; the rest
 * arrive as a list. A blank password on any of them keeps the stored one, so
 * the client never has to hold a secret to save an unrelated field.
 */
function mergeMailboxes(
  current: Mailbox[],
  incoming: unknown,
  primary: Mailbox,
): Mailbox[] {
  if (!Array.isArray(incoming)) return [primary, ...current.slice(1)];
  const extras = incoming
    .filter((box): box is Partial<Mailbox> => Boolean(box) && typeof box === "object")
    .filter((box) => box.id !== primary.id)
    .slice(0, 9)
    .map((box, index) => {
      const id = typeof box.id === "string" && box.id ? box.id : `mailbox-${Date.now()}-${index}`;
      const saved = current.find((existing) => existing.id === id);
      const port = Number(box.port);
      return {
        id,
        label: typeof box.label === "string" ? box.label.trim() : (saved?.label ?? ""),
        host: typeof box.host === "string" ? box.host.trim() : (saved?.host ?? ""),
        port: port > 0 ? port : (saved?.port ?? 587),
        user: typeof box.user === "string" ? box.user.trim() : (saved?.user ?? ""),
        pass: typeof box.pass === "string" && box.pass !== "" ? box.pass : (saved?.pass ?? ""),
        from: typeof box.from === "string" ? box.from.trim() : (saved?.from ?? ""),
        replyTo: typeof box.replyTo === "string" ? box.replyTo.trim() : (saved?.replyTo ?? ""),
      };
    });
  return [primary, ...extras];
}

export async function POST(request: Request) {
  const { user, response: denied } = await requireUser();
  if (!user) return denied;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const current = await readSettings(user.id);
  const email = (payload.email ?? {}) as Record<string, unknown>;
  const primary = current.mailboxes[0];
  const imap = (payload.imap ?? {}) as Record<string, unknown>;
  const accounts = (payload.accounts ?? {}) as Record<string, unknown>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" ? value.trim() : fallback;

  const next: AppSettings = {
    language: payload.language === "ru" ? "ru" : "en",
    mailboxes: mergeMailboxes(current.mailboxes, payload.mailboxes, {
      id: primary.id,
      label: str(email.label, primary.label),
      host: str(email.host, primary.host),
      port: Number(email.port) > 0 ? Number(email.port) : primary.port,
      user: str(email.user, primary.user),
      // An empty password field means "keep the stored one".
      pass: typeof email.pass === "string" && email.pass !== "" ? email.pass : primary.pass,
      from: str(email.from, primary.from),
      replyTo: str(email.replyTo, primary.replyTo),
    }),
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

  await writeSettings(user.id, next);
  return NextResponse.json(toPublicSettings(next));
}

/** Disconnects every saved account, keeping only the chosen language. */
export async function DELETE() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const current = await readSettings(user.id);
  const cleared: AppSettings = {
    language: current.language,
    mailboxes: [
      { id: PRIMARY_MAILBOX, label: "", host: "", port: 587, user: "", pass: "", from: "", replyTo: "" },
    ],
    imap: { host: "", port: 993, user: "", pass: "" },
    accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
    telegramBotToken: "",
  };
  await writeSettings(user.id, cleared);
  return NextResponse.json(toPublicSettings(cleared));
}
