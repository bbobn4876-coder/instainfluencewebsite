import nodemailer, { type Transporter } from "nodemailer";
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

function transporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export function emailConfigured(): boolean {
  return transporter() !== null;
}

function dmUrl(platform: string, url: string, username: string): string {
  if (platform === "instagram") return `https://ig.me/m/${username}`;
  if (platform === "telegram") return url;
  return url;
}

export async function runOutreach(request: OutreachRequest): Promise<OutreachResult[]> {
  const results: OutreachResult[] = [];
  const mailer = transporter();
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";

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
          if (!mailer) {
            results.push({
              influencerId: influencer.id,
              username: influencer.username,
              channel: "email",
              target: to,
              status: "drafted",
              detail: "SMTP is not configured — message prepared but not sent.",
            });
            continue;
          }
          try {
            await mailer.sendMail({ from, to, subject, text: body });
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
        detail: body,
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
