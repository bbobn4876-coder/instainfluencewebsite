import nodemailer, { type Transporter } from "nodemailer";
import { normalizeHandle, readSettings } from "./settings";
import type { Influencer, OutreachResult } from "./types";

export type OutreachRequest = {
  influencers: Influencer[];
  subject: string;
  body: string;
  channels: { email: boolean; instagram: boolean; other: boolean };
};

export function renderTemplate(template: string, influencer: Influencer): string {
  return template
    .replace(/\{\{\s*username\s*\}\}/g, influencer.username)
    .replace(/\{\{\s*name\s*\}\}/g, influencer.fullName || influencer.username)
    .replace(/\{\{\s*followers\s*\}\}/g, influencer.followers.toLocaleString("en-US"))
    .replace(/\{\{\s*category\s*\}\}/g, influencer.category)
    .replace(/\{\{\s*country\s*\}\}/g, influencer.country)
    .replace(/\{\{\s*city\s*\}\}/g, influencer.city ?? influencer.country);
}

type MailAccount = { transport: Transporter; from: string; replyTo?: string };

/** Built from the account saved in Settings, falling back to the SMTP_* env vars. */
async function mailAccount(): Promise<MailAccount | null> {
  const { email } = await readSettings();
  if (!email.host || !email.user || !email.pass) return null;
  const port = email.port > 0 ? email.port : 587;
  return {
    transport: nodemailer.createTransport({
      host: email.host,
      port,
      secure: port === 465,
      auth: { user: email.user, pass: email.pass },
      // Fail fast instead of hanging the request when the host is unreachable.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }),
    from: email.from || email.user,
    replyTo: email.replyTo || undefined,
  };
}

export async function emailConfigured(): Promise<boolean> {
  return (await mailAccount()) !== null;
}

export async function verifyEmailAccount(): Promise<{ ok: boolean; detail: string }> {
  const account = await mailAccount();
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
  const account = await mailAccount();
  const { accounts } = await readSettings();
  const sender = normalizeHandle(accounts.instagram);

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
