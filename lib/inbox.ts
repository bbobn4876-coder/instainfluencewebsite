import { ImapFlow } from "imapflow";
import { readSettings } from "./settings";

export type InboxChannel = "email" | "instagram" | "telegram";

export type InboxMessage = {
  id: string;
  channel: InboxChannel;
  from: string;
  handle?: string;
  subject?: string;
  preview: string;
  date: string;
  unread: boolean;
  link?: string;
};

export type ChannelStatus = {
  channel: InboxChannel;
  connected: boolean;
  detail?: string;
};

export type InboxResult = {
  messages: InboxMessage[];
  channels: ChannelStatus[];
};

const PREVIEW_LENGTH = 220;

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

async function emailInbox(userId: string, limit: number): Promise<{ messages: InboxMessage[]; status: ChannelStatus }> {
  const settings = await readSettings(userId);
  const { imap } = settings;
  // The IMAP block falls back to the primary mailbox when only the host is given.
  const primary = settings.mailboxes[0];
  const host = imap.host;
  const user = imap.user || primary?.user || "";
  const pass = imap.pass || primary?.pass || "";
  if (!host || !user || !pass) {
    return {
      messages: [],
      status: { channel: "email", connected: false, detail: "No IMAP account saved." },
    };
  }

  const client = new ImapFlow({
    host,
    port: imap.port > 0 ? imap.port : 993,
    secure: (imap.port || 993) === 993,
    auth: { user, pass },
    logger: false,
    socketTimeout: 20_000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const messages: InboxMessage[] = [];
    try {
      const total = typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      if (total > 0) {
        const range = `${Math.max(1, total - limit + 1)}:${total}`;
        for await (const message of client.fetch(range, {
          envelope: true,
          flags: true,
          bodyParts: ["text"],
        })) {
          const sender = message.envelope?.from?.[0];
          const text = message.bodyParts?.get("text")?.toString("utf8") ?? "";
          messages.push({
            id: `email:${message.uid}`,
            channel: "email",
            from: sender?.name || sender?.address || "unknown",
            handle: sender?.address,
            subject: message.envelope?.subject ?? "",
            preview: preview(text),
            date: new Date(message.envelope?.date ?? Date.now()).toISOString(),
            unread: !message.flags?.has("\\Seen"),
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return {
      messages: messages.reverse(),
      status: { channel: "email", connected: true },
    };
  } catch (error) {
    try {
      await client.close();
    } catch {
      /* already closed */
    }
    return {
      messages: [],
      status: { channel: "email", connected: false, detail: (error as Error).message },
    };
  }
}

/**
 * Instagram conversations through the Messaging API. Meta only exposes threads
 * where the other side wrote first, so this is the inbox, not a full history.
 */
async function instagramInbox(limit: number): Promise<{ messages: InboxMessage[]; status: ChannelStatus }> {
  const token = process.env.IG_ACCESS_TOKEN;
  const account = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!token || !account) {
    return {
      messages: [],
      status: {
        channel: "instagram",
        connected: false,
        detail: "Set IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID to read Instagram messages.",
      },
    };
  }

  try {
    const fields = `conversations{participants,messages.limit(1){message,from,created_time}}`;
    const url = `https://graph.facebook.com/v21.0/${account}?platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      conversations?: {
        data?: Array<{
          id: string;
          participants?: { data?: Array<{ username?: string; id: string }> };
          messages?: { data?: Array<{ message?: string; created_time?: string }> };
        }>;
      };
    };

    const messages: InboxMessage[] = (data.conversations?.data ?? [])
      .slice(0, limit)
      .map((thread) => {
        const other = thread.participants?.data?.find((p) => p.id !== account);
        const last = thread.messages?.data?.[0];
        const handle = other?.username;
        return {
          id: `instagram:${thread.id}`,
          channel: "instagram" as const,
          from: handle ? `@${handle}` : "instagram user",
          handle,
          preview: preview(last?.message ?? ""),
          date: last?.created_time ?? new Date().toISOString(),
          unread: false,
          link: handle ? `https://ig.me/m/${handle}` : undefined,
        };
      });

    return { messages, status: { channel: "instagram", connected: true } };
  } catch (error) {
    return {
      messages: [],
      status: { channel: "instagram", connected: false, detail: (error as Error).message },
    };
  }
}

/** Telegram inbox via a bot: only chats that messaged the bot are visible. */
async function telegramInbox(userId: string, limit: number): Promise<{ messages: InboxMessage[]; status: ChannelStatus }> {
  const { telegramBotToken } = await readSettings(userId);
  if (!telegramBotToken) {
    return {
      messages: [],
      status: { channel: "telegram", connected: false, detail: "No Telegram bot token saved." },
    };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${telegramBotToken}/getUpdates?limit=${limit}&allowed_updates=${encodeURIComponent('["message"]')}`,
      { cache: "no-store" },
    );
    if (!res.ok && res.status >= 500) throw new Error(`Telegram is unreachable (${res.status}).`);
    const raw = await res.text();
    let data: {
      ok: boolean;
      description?: string;
      result?: Array<{
        update_id: number;
        message?: {
          text?: string;
          date: number;
          from?: { username?: string; first_name?: string };
        };
      }>;
    };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Unexpected response from Telegram (${res.status}).`);
    }
    if (!data.ok) throw new Error(data.description ?? "Telegram rejected the request.");

    const messages: InboxMessage[] = (data.result ?? [])
      .filter((update) => update.message)
      .map((update) => {
        const message = update.message!;
        const handle = message.from?.username;
        return {
          id: `telegram:${update.update_id}`,
          channel: "telegram" as const,
          from: handle ? `@${handle}` : message.from?.first_name || "telegram user",
          handle,
          preview: preview(message.text ?? ""),
          date: new Date(message.date * 1000).toISOString(),
          unread: false,
          link: handle ? `https://t.me/${handle}` : undefined,
        };
      })
      .reverse();

    return { messages, status: { channel: "telegram", connected: true } };
  } catch (error) {
    return {
      messages: [],
      status: { channel: "telegram", connected: false, detail: (error as Error).message },
    };
  }
}

export async function fetchInbox(userId: string, limit = 25): Promise<InboxResult> {
  const [email, instagram, telegram] = await Promise.all([
    emailInbox(userId, limit),
    instagramInbox(limit),
    telegramInbox(userId, limit),
  ]);

  const messages = [...email.messages, ...instagram.messages, ...telegram.messages].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return { messages, channels: [email.status, instagram.status, telegram.status] };
}
