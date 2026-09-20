import nodemailer from "nodemailer";

export type DeliveryResult = { sent: boolean; detail: string; link?: string };

/**
 * Mail sent by the platform itself — verification and password resets. It is a
 * separate mailbox from the one a user connects in Settings, because at signup
 * there is no connected account yet.
 */
function transport() {
  const { SYSTEM_SMTP_HOST, SYSTEM_SMTP_PORT, SYSTEM_SMTP_USER, SYSTEM_SMTP_PASS } = process.env;
  if (!SYSTEM_SMTP_HOST || !SYSTEM_SMTP_USER || !SYSTEM_SMTP_PASS) return null;
  const port = Number(SYSTEM_SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: SYSTEM_SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SYSTEM_SMTP_USER, pass: SYSTEM_SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

export function systemMailConfigured(): boolean {
  return transport() !== null;
}

export function appUrl(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function sendSystemMail(
  to: string,
  subject: string,
  text: string,
  link: string,
): Promise<DeliveryResult> {
  const mailer = transport();
  if (!mailer) {
    // Without a platform mailbox the link is logged and handed back, so a local
    // or self-hosted instance still works before SMTP is set up.
    console.info(`[loomera] ${subject} for ${to}: ${link}`);
    return { sent: false, detail: "System mailbox is not configured.", link };
  }
  try {
    await mailer.sendMail({
      from: process.env.SYSTEM_MAIL_FROM ?? process.env.SYSTEM_SMTP_USER,
      to,
      subject,
      text,
    });
    return { sent: true, detail: "Sent." };
  } catch (error) {
    console.info(`[loomera] ${subject} for ${to}: ${link}`);
    return { sent: false, detail: (error as Error).message, link };
  }
}
