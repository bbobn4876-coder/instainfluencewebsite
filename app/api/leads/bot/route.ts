/**
 * The Leads page's control panel for the Telegram bot: what state the bot is in,
 * a one-time code to link a chat, and the webhook switch.
 *
 * The token itself is never sent to the browser — only whether one is present.
 */
import { NextResponse } from "next/server";
import { chatsOf, createLinkCode, unlinkChat } from "@/lib/botChats";
import {
  botConfigured,
  deleteWebhook,
  getMe,
  getWebhookInfo,
  setWebhook,
} from "@/lib/leadBot";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Where Telegram should post updates, from the host's own URL. */
function webhookUrl(request: Request): string {
  const configured = process.env.APP_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  const base = configured ? configured.replace(/\/$/, "") : new URL(request.url).origin;
  return `${base}/api/telegram/webhook`;
}

async function status(request: Request, userId: string) {
  const configured = botConfigured();
  const chats = await chatsOf(userId);

  if (!configured) {
    return {
      configured: false,
      envKey: "LEADS_BOT_TOKEN",
      username: null,
      webhook: null,
      webhookUrl: webhookUrl(request),
      chats,
    };
  }

  const [me, hook] = await Promise.all([getMe(), getWebhookInfo()]);
  return {
    configured: true,
    envKey: "LEADS_BOT_TOKEN",
    username: me.ok ? (me.result.username ?? null) : null,
    error: me.ok ? null : me.error,
    webhook: hook.ok
      ? {
          url: hook.result.url ?? "",
          pending: hook.result.pending_update_count ?? 0,
          lastError: hook.result.last_error_message ?? null,
        }
      : null,
    webhookUrl: webhookUrl(request),
    chats,
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json(await status(request, user.id));
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    chatId?: string;
  };

  switch (body.action) {
    case "code": {
      const { code, expiresAt } = await createLinkCode(user.id);
      return NextResponse.json({ code, expiresAt });
    }

    case "setWebhook": {
      if (!botConfigured()) {
        return NextResponse.json(
          { error: "Set LEADS_BOT_TOKEN first, then try again." },
          { status: 400 },
        );
      }
      const url = webhookUrl(request);
      if (!url.startsWith("https://")) {
        // Telegram only calls https, so a local run cannot receive updates.
        return NextResponse.json(
          { error: `Telegram needs an https URL; this deploy reports ${url}.` },
          { status: 400 },
        );
      }
      const result = await setWebhook(url);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json(await status(request, user.id));
    }

    case "deleteWebhook": {
      const result = await deleteWebhook();
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json(await status(request, user.id));
    }

    case "unlink": {
      if (!body.chatId) return NextResponse.json({ error: "No chat given." }, { status: 400 });
      const done = await unlinkChat(body.chatId, user.id);
      if (!done) return NextResponse.json({ error: "That chat is not yours." }, { status: 404 });
      return NextResponse.json(await status(request, user.id));
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
