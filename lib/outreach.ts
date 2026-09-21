import nodemailer, { type Transporter } from "nodemailer";
import { mailboxById, normalizeHandle, readSettings, type Mailbox } from "./settings";
import { renderTemplate } from "./tokens";
import type { Influencer, OutreachResult } from "./types";

export type OutreachRequest = {
  userId: string;
  influencers: Influencer[];
  subject: string;
  body: string;
  channels: { email: boolean; instagram: boolean; other: boolean };
  /** Mailbox every recipient uses unless named below. */
  fromMailbox?: string;
  /** Per-recipient mailbox, keyed by influencer id. */
  senders?: Record<string, string>;
};

type MailAccount = { id: string; transport: Transporter; from: string; replyTo?: string };

function toAccount(box: Mailbox): MailAccount {
  const port = box.port > 0 ? box.port : 587;
  return {
    id: box.id,
    transport: nodemailer.createTransport({
      host: box.host,
      port,
      secure: port === 465,
      auth: { user: box.user, pass: box.pass },
      // Fail fast instead of hanging the request when the host is unreachable.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }),
    from: box.from || box.user,
    replyTo: box.replyTo || undefined,
  };
}

/** Built from the mailboxes saved in Settings, falling back to the SMTP_* env vars. */
async function mailAccount(userId: string, mailboxId?: string): Promise<MailAccount | null> {
  const settings = await readSettings(userId);
  const box = mailboxById(settings, mailboxId);
  return box ? toAccount(box) : null;
}

export async function emailConfigured(userId: string): Promise<boolean> {
  return (await mailAccount(userId)) !== null;
}

export async function verifyEmailAccount(
  userId: string,
  mailboxId?: string,
): Promise<{ ok: boolean; detail: string }> {
  const account = await mailAccount(userId, mailboxId);
  if (!account) return { ok: false, detail: "No email account saved." };
  try {
    await account.transport.verify();
    return { ok: true, detail: `Connected as ${account.from}` };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

function dmUrl(platform: string, url: string, username: string): string {
  if (platform === "instagram") return `https://ig.me/m/${username}`;
  if (platform === "telegram") return url;
  return url;
}

export async function runOutreach(request: OutreachRequest): Promise<OutreachResult[]> {
  const results: OutreachResult[] = [];
  const settings = await readSettings(request.userId);
  const { accounts } = settings;
  const sender = normalizeHandle(accounts.instagram);

  // One transport per mailbox, opened once and shared by its recipients.
  const opened = new Map<string, MailAccount | null>();
  const accountFor = (influencerId: string): MailAccount | null => {
    const wanted = request.senders?.[influencerId] ?? request.fromMailbox;
    const box = mailboxById(settings, wanted);
    if (!box) return null;
    if (!opened.has(box.id)) opened.set(box.id, toAccount(box));
    return opened.get(box.id) ?? null;
  };

  for (const influencer of request.influencers) {
    const subject = renderTemplate(request.subject, influencer);
    const body = renderTemplate(request.body, influencer);

    if (request.channels.email) {
      if (influencer.emails.length === 0) {
        results.push({
          influencerId: influencer.id,
          username: influencer.username,
          channel: "email",
          target: "—",
          status: "skipped",
          detail: "No public email in the profile.",
        });
      } else {
        const account = accountFor(influencer.id);
        for (const to of influencer.emails) {
          if (!account) {
            results.push({
              influencerId: influencer.id,
              username: influencer.username,
              channel: "email",
              target: to,
              status: "drafted",
              detail: "No email account connected — message prepared but not sent.",
            });
            continue;
          }
          try {
            await account.transport.sendMail({
              from: account.from,
              replyTo: account.replyTo,
              to,
              subject,
              text: body,
            });
            results.push({
              influencerId: influencer.id,
              username: influencer.username,
              channel: "email",
              target: to,
              status: "sent",
              // Which mailbox it left from, so the log can be read back.
              detail: `from ${account.from}`,
            });
          } catch (error) {
            results.push({
              influencerId: influencer.id,
              username: influencer.username,
              channel: "email",
              target: to,
              status: "failed",
              detail: (error as Error).message,
            });
          }
        }
      }
    }

    // Instagram and third-party networks have no compliant server-side send API
    // for cold outreach, so those channels produce a ready-to-open draft instead.
    if (request.channels.instagram) {
      results.push({
        influencerId: influencer.id,
        username: influencer.username,
        channel: "instagram",
        target: dmUrl("instagram", influencer.profileUrl, influencer.username),
        status: "drafted",
        detail: sender ? `from @${sender} · ${body}` : body,
      });
    }

    if (request.channels.other) {
      const others = influencer.links.filter((l) => l.platform !== "instagram");
      if (others.length === 0) {
        results.push({
          influencerId: influencer.id,
          username: influencer.username,
          channel: "other",
          target: "—",
          status: "skipped",
          detail: "No other social links in the profile.",
        });
      }
      for (const link of others) {
        results.push({
          influencerId: influencer.id,
          username: influencer.username,
          channel: "other",
          target: dmUrl(link.platform, link.url, influencer.username),
          status: "drafted",
          detail: `${link.platform} · ${body}`,
        });
      }
    }
  }

  return results;
}
