/**
 * The bot's end of the Leads tool.
 *
 * Telegram POSTs every update here. Each update is answered inline: the searches
 * are the same ones the page runs, through runLeadSearch, so a chat and a browser
 * always see the same modules, limits and plan quota.
 *
 * The handler always answers 200. A non-200 makes Telegram retry the same update
 * for hours, which would re-run paid searches; anything that goes wrong is
 * reported into the chat instead.
 */
import { NextResponse } from "next/server";
import { userById } from "@/lib/auth";
import {
  defaultChat,
  getChat,
  redeemLinkCode,
  saveChat,
  type BotChat,
} from "@/lib/botChats";
import {
  answerCallbackQuery,
  botConfigured,
  editMessageText,
  escapeHtml,
  formatLead,
  sendMessage,
  sourceKeyboard,
  sourceName,
  webhookSecret,
} from "@/lib/leadBot";
import { LEAD_CATEGORIES, LEAD_SOURCES, MODULES, type LeadSource } from "@/lib/leads";
import { runLeadSearch, toLeadQuery } from "@/lib/leadSearch";
import { allowance } from "@/lib/subscription";

export const dynamic = "force-dynamic";

type Update = {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; title?: string; username?: string; type: string };
    from?: { username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

const HELP = [
  "<b>Лиды в Telegram</b>",
  "",
  "/link КОД — привязать чат к аккаунту (код на странице Leads)",
  "/leads — найти лиды по текущим настройкам",
  "/sources — выбрать источники",
  "/city Москва — задать город",
  "/category beauty — задать категорию",
  "/keywords нужен смм, ищу видеографа — ключевые слова",
  "/limit 10 — сколько лидов присылать",
  "/status — текущие настройки",
  "/unlink — отвязать чат",
].join("\n");

function settingsText(chat: BotChat): string {
  return [
    "<b>Настройки чата</b>",
    `Аккаунт: ${chat.userId ? "привязан" : "не привязан"}`,
    `Город: ${escapeHtml(chat.city || "—")}`,
    `Категория: ${escapeHtml(chat.categories[0] ?? "—")}`,
    `Ключевые слова: ${escapeHtml(chat.keywords.join(", ") || "—")}`,
    `Источники: ${chat.sources.map(sourceName).join(", ") || "—"}`,
    `Лидов за раз: ${chat.limit}`,
  ].join("\n");
}

/** Runs a search for a chat and sends the results into it. */
async function runFor(chat: BotChat): Promise<void> {
  if (!chat.userId) {
    await sendMessage(
      chat.chatId,
      "Этот чат не привязан к аккаунту. Откройте страницу Leads, нажмите «Подключить Telegram» и пришлите сюда <code>/link КОД</code>.",
    );
    return;
  }

  const user = await userById(chat.userId);
  if (!user) {
    // The account was deleted while the chat stayed linked.
    await saveChat({ ...chat, userId: null, linkedAt: null });
    await sendMessage(chat.chatId, "Аккаунт больше не существует — чат отвязан.");
    return;
  }

  const quota = await allowance(user.id, user.isAdmin);
  if (!quota.limits) {
    await sendMessage(chat.chatId, "На аккаунте нет активной подписки — поиск недоступен.");
    return;
  }

  await sendMessage(chat.chatId, "Ищу лиды…");

  const query = toLeadQuery({
    sources: chat.sources,
    city: chat.city,
    categories: chat.categories,
    keywords: chat.keywords,
    limit: chat.limit,
  });
  if (query.sources.length === 0) {
    await sendMessage(chat.chatId, "Не выбран ни один источник. /sources");
    return;
  }

  let result;
  try {
    result = await runLeadSearch(user.id, query);
  } catch (error) {
    await sendMessage(chat.chatId, `Поиск не удался: ${escapeHtml((error as Error).message)}`);
    return;
  }

  const head: string[] = [`Найдено: <b>${result.leads.length}</b>`];
  if (result.notes.includes("sample")) {
    head.push("Ни один источник не подключён — это примеры.");
  }
  for (const note of result.notes.filter((one) => one !== "sample")) {
    head.push(escapeHtml(note));
  }
  if (result.skipped.length) {
    head.push(`Не запускались: ${result.skipped.map(sourceName).join(", ")}`);
  }
  await sendMessage(chat.chatId, head.join("\n"));

  for (const [index, lead] of result.leads.entries()) {
    await sendMessage(chat.chatId, formatLead(lead, index, result.leads.length));
  }
}

async function handleCommand(chat: BotChat, text: string): Promise<void> {
  // Group chats address commands as /leads@mybot.
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argument = rest.join(" ").trim();

  switch (command) {
    case "/start":
    case "/help":
      await sendMessage(chat.chatId, HELP);
      return;

    case "/link": {
      const userId = await redeemLinkCode(argument);
      if (!userId) {
        await sendMessage(chat.chatId, "Код не подошёл или истёк. Возьмите новый на странице Leads.");
        return;
      }
      await saveChat({ ...chat, userId, linkedAt: new Date().toISOString() });
      await sendMessage(chat.chatId, "Чат привязан. /leads — найти лиды.");
      return;
    }

    case "/unlink":
      await saveChat({ ...chat, userId: null, linkedAt: null });
      await sendMessage(chat.chatId, "Чат отвязан.");
      return;

    case "/status":
      await sendMessage(chat.chatId, settingsText(chat));
      return;

    case "/sources":
      await sendMessage(chat.chatId, "Источники:", sourceKeyboard(chat.sources));
      return;

    case "/city":
      if (!argument) {
        await sendMessage(chat.chatId, "Например: <code>/city Москва</code>");
        return;
      }
      await saveChat({ ...chat, city: argument });
      await sendMessage(chat.chatId, `Город: ${escapeHtml(argument)}`);
      return;

    case "/category": {
      const wanted = argument.toLowerCase();
      if (!LEAD_CATEGORIES.includes(wanted)) {
        await sendMessage(
          chat.chatId,
          `Категории: ${LEAD_CATEGORIES.map((one) => `<code>${one}</code>`).join(", ")}`,
        );
        return;
      }
      await saveChat({ ...chat, categories: [wanted] });
      await sendMessage(chat.chatId, `Категория: ${wanted}`);
      return;
    }

    case "/keywords": {
      const keywords = argument
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean);
      await saveChat({ ...chat, keywords });
      await sendMessage(
        chat.chatId,
        keywords.length
          ? `Ключевые слова: ${escapeHtml(keywords.join(", "))}`
          : "Ключевые слова очищены.",
      );
      return;
    }

    case "/limit": {
      const limit = Number(argument);
      if (!Number.isFinite(limit) || limit < 1) {
        await sendMessage(chat.chatId, "Например: <code>/limit 10</code>");
        return;
      }
      // Each lead is its own message, so a big number would flood the chat and
      // hit Telegram's rate limit.
      await saveChat({ ...chat, limit: Math.min(25, Math.round(limit)) });
      await sendMessage(chat.chatId, `Лидов за раз: ${Math.min(25, Math.round(limit))}`);
      return;
    }

    case "/leads":
      await runFor(chat);
      return;

    default:
      await sendMessage(chat.chatId, HELP);
  }
}

async function handleCallback(update: NonNullable<Update["callback_query"]>): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) {
    await answerCallbackQuery(update.id);
    return;
  }

  const chat = await getChat(String(chatId));
  const data = update.data ?? "";

  if (data === "run") {
    await answerCallbackQuery(update.id, "Ищу…");
    await runFor(chat);
    return;
  }

  if (data.startsWith("src:")) {
    const id = data.slice(4) as LeadSource;
    if (!LEAD_SOURCES.includes(id) || MODULES[id].unavailable) {
      await answerCallbackQuery(update.id, "Этот источник недоступен.");
      return;
    }
    const sources = chat.sources.includes(id)
      ? chat.sources.filter((one) => one !== id)
      : [...chat.sources, id];
    await saveChat({ ...chat, sources });
    await answerCallbackQuery(update.id);
    if (update.message) {
      await editMessageText(chatId, update.message.message_id, "Источники:", sourceKeyboard(sources));
    }
    return;
  }

  await answerCallbackQuery(update.id);
}

export async function POST(request: Request) {
  if (!botConfigured()) {
    // Nothing to verify against, so nothing is trusted.
    return NextResponse.json({ ok: false, error: "No bot token is set." }, { status: 503 });
  }

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return NextResponse.json({ ok: true });

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text) {
      const message = update.message;
      const stored = await getChat(String(message.chat.id));
      const title =
        message.chat.title ||
        message.from?.username ||
        message.from?.first_name ||
        defaultChat(String(message.chat.id)).title;
      const chat = { ...stored, title };
      if (title !== stored.title) await saveChat(chat);

      const text = (message.text ?? "").trim();
      // In a group only commands are for the bot; the chatter is not.
      if (text.startsWith("/")) await handleCommand(chat, text);
      else if (message.chat.type === "private") await handleCommand(chat, "/help");
    }
  } catch (error) {
    console.error("telegram webhook", error);
  }

  return NextResponse.json({ ok: true });
}
