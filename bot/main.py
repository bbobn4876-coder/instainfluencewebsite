#!/usr/bin/env python3
"""Loomera Leads bot — the Leads tool, and nothing else.

Run it:   python3 bot/main.py

Long polling, so there is no server, no webhook and no public URL. Stop it with
Ctrl-C; the settings and the collected messages stay in the SQLite file beside
this script.
"""

from __future__ import annotations

import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import telegram_api as tg
import ui
from config import ALLOWED_USERS, BOT_TOKEN, configured_sources
from leads import SIGNAL_NAMES, SOURCE_NAMES, Lead, Query, clean
from sources import instagram as ig_source
from sources import maps as maps_source
from sources import telegram as tg_source
from sources import vk as vk_source
from storage import (
    archive_size,
    connect,
    forget_old,
    get_pending,
    get_query,
    forget_chat,
    note_chat_activity,
    register_chat,
    remember_message,
    save_query,
    set_pending,
    watched_chats,
)
from web import TlsError, get_json

BOT_USERNAME = ""

TLS_HELP = """Между вами и Telegram что-то пересобирает HTTPS: антивирус с проверкой
трафика (Kaspersky, ESET, Dr.Web), корпоративный прокси или VPN-клиент. Браузер
его корневой сертификат уже знает, а у Python своё хранилище.

Что делать — по порядку:

1) macOS, свежий Python: запустите установщик сертификатов, он лежит рядом с
   самим Python:
      /Applications/Python\ 3.x/Install\ Certificates.command

2) Поставьте актуальные корневые сертификаты:
      python3 -m pip install --upgrade certifi
   Бот подхватит их сам, ничего настраивать не нужно.

3) Антивирус или рабочая сеть: экспортируйте их корневой сертификат в .pem и
   укажите путь в bot/.env:
      LEADS_CA_BUNDLE=/путь/к/corporate-root.pem
   В Windows он обычно в «Сертификаты → Доверенные корневые», экспорт
   «Base-64 encoded X.509 (.CER)», файл можно просто переименовать в .pem.

4) Проще всего — выключить проверку HTTPS в антивирусе или запустить бота из
   сети без такого прокси (мобильный интернет, домашний Wi-Fi).

Совсем крайний случай — LEADS_INSECURE=1 в bot/.env. Проверка отключится, и
тот, кто вклинился в соединение, сможет прочитать токен бота. Так можно
убедиться, что дело именно в сертификате, но жить с этим не стоит."""



def priority_bar(value: int) -> str:
    """A five-block bar, so the score reads at a glance while scrolling."""
    filled = round(value / 20)
    return "▰" * filled + "▱" * (5 - filled)


def format_lead(lead: Lead, index: int, total: int) -> str:
    lines = [
        f"<b>{tg.esc(lead.name)}</b>",
        f"{priority_bar(lead.priority)} {lead.priority}/100 · {SOURCE_NAMES[lead.source]}"
        + (f" · {tg.esc(lead.city)}" if lead.city else ""),
    ]

    if lead.signals:
        named = ", ".join(SIGNAL_NAMES.get(signal, signal) for signal in lead.signals)
        lines.append(f"🎯 {tg.esc(named)}")

    if lead.context:
        lines += ["", f"<blockquote>{tg.esc(lead.context[:500])}</blockquote>"]

    contacts = [f"✉️ <code>{tg.esc(one)}</code>" for one in lead.emails]
    contacts += [f"📞 <code>{tg.esc(one)}</code>" for one in lead.phones]
    if contacts:
        # In code tags, so a tap copies the address instead of selecting it.
        lines += [""] + contacts

    tail = []
    if lead.url:
        tail.append(f'<a href="{tg.esc(lead.url)}">Открыть</a>')
    for link in lead.links[:3]:
        tail.append(f'<a href="{tg.esc(link["url"])}">{tg.esc(link["platform"])}</a>')
    if tail:
        lines += ["", " · ".join(tail)]

    lines += ["", f"<i>{index + 1} из {total}</i>"]
    return "\n".join(lines)


def run_search(db, chat_id: int, query: Query) -> None:
    configured = configured_sources()
    live = [source for source in query.sources if configured[source]]
    if not live:
        tg.send_message(
            chat_id,
            "Не выбран ни один доступный источник.",
            [[ui.button("📡 Источники", "screen:sources")]],
        )
        return

    tg.send_message(chat_id, f"Ищу: {', '.join(SOURCE_NAMES[one] for one in live)}…")

    found: list[Lead] = []
    problems: list[str] = []

    # Telegram reads the local archive, so it stays on this thread; the three
    # network sources run together, because each one waits on someone else.
    if "telegram" in live:
        try:
            found += tg_source.find(query, db)
        except Exception as error:
            problems.append(f"Telegram: {error}")

    runners = {"vk": vk_source.find, "maps": maps_source.find, "instagram": ig_source.find}
    remote = [source for source in live if source in runners]
    if remote:
        with ThreadPoolExecutor(max_workers=len(remote)) as pool:
            jobs = {source: pool.submit(runners[source], query) for source in remote}
            for source, job in jobs.items():
                try:
                    found += job.result()
                except Exception as error:
                    problems.append(f"{SOURCE_NAMES[source]}: {error}")

    leads = clean(found, query.stop_words)[: query.limit]

    report = [f"Найдено: <b>{len(leads)}</b>"]
    skipped = [SOURCE_NAMES[one] for one in query.sources if one not in live]
    if skipped:
        report.append(f"🔒 Без ключа, не запускались: {', '.join(skipped)}")
    report += [tg.esc(problem) for problem in problems]

    keyboard = [[ui.button("🔎 Ещё раз", "run"), ui.button("⚙️ Настройки", "home")]]

    if not leads and not problems:
        report += ["", *empty_advice(db, live)]
        if "telegram" in live and not watched_chats(db):
            keyboard.insert(0, [ui.button("💬 Как подключить чаты", "screen:chats")])

    # The buttons ride on the last message, so they are never scrolled past.
    tg.send_message(chat_id, "\n".join(report), keyboard if not leads else None)

    for index, lead in enumerate(leads):
        last = index == len(leads) - 1
        tg.send_message(chat_id, format_lead(lead, index, len(leads)), keyboard if last else None)
        # Telegram drops messages sent faster than about one per second per chat.
        time.sleep(0.4)


def empty_advice(db, live: list[str]) -> list[str]:
    """Why nothing came back — the real reason, not a guess about the wording."""
    lines: list[str] = []

    if "telegram" in live:
        chats = watched_chats(db)
        stored = archive_size(db)
        if not chats:
            lines += [
                "<b>Telegram ничего не нашёл: бот не добавлен ни в один чат.</b>",
                "Этот источник ищет только по сообщениям групп, куда его добавили — "
                "глобального поиска по Telegram у ботов нет.",
            ]
        elif all(chat["seen"] == 0 for chat in chats):
            lines += [
                "<b>Бот в чатах, но сообщений не получает</b> — включён Group Privacy. "
                "Выключите его в @BotFather и добавьте бота в чат заново.",
            ]
        elif stored == 0:
            lines.append(
                "Бот читает чаты, но пока не встретил сообщений, похожих на поиск "
                "подрядчика. Они копятся со временем."
            )
        else:
            lines.append(f"В базе {stored} сообщений, но под запрос ничего не подошло.")

    others = [SOURCE_NAMES[one] for one in live if one != "telegram"]
    if others:
        lines.append(f"{', '.join(others)}: попробуйте другой город, категорию или слова.")

    return lines


# ---------------------------------------------------------------------- экраны

SCREENS = {
    "city": lambda query, db: ui.city_screen(query),
    "category": lambda query, db: ui.category_screen(query),
    "keywords": lambda query, db: ui.keywords_screen(query),
    "limit": lambda query, db: ui.limit_screen(query),
    "sources": lambda query, db: ui.sources_screen(query),
    "chats": lambda query, db: ui.chats_screen(db),
    "help": lambda query, db: ui.help_screen(),
}

ASK_PROMPTS = {
    "city": "Пришлите город одним сообщением. Например: <code>Казань</code>",
    "keywords": (
        "Пришлите слова через запятую.\n"
        "Например: <code>нужен смм, ищу видеографа, продвижение</code>"
    ),
}


def show(db, chat_id: int, screen: str, message_id: int | None = None) -> None:
    """Draws a screen, in place when it is replacing a menu."""
    query = get_query(db, chat_id)
    text, keyboard = ui.home(query, db) if screen == "home" else SCREENS[screen](query, db)
    if message_id:
        tg.edit_message(chat_id, message_id, text, keyboard)
    else:
        tg.send_message(chat_id, text, keyboard)


def handle_callback(db, callback: dict) -> None:
    message = callback.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    message_id = message.get("message_id")
    data = callback.get("data") or ""

    if chat_id is None:
        tg.answer_callback(callback["id"])
        return

    if ALLOWED_USERS and (callback.get("from") or {}).get("id") not in ALLOWED_USERS:
        tg.answer_callback(callback["id"], "Этот бот приватный.")
        return

    query = get_query(db, chat_id)

    # Navigation first: these only redraw.
    if data == "home":
        set_pending(db, chat_id, None)
        tg.answer_callback(callback["id"])
        show(db, chat_id, "home", message_id)
        return

    if data.startswith("screen:"):
        tg.answer_callback(callback["id"])
        show(db, chat_id, data.split(":", 1)[1], message_id)
        return

    if data.startswith("ask:"):
        field = data.split(":", 1)[1]
        set_pending(db, chat_id, field)
        tg.answer_callback(callback["id"])
        tg.edit_message(chat_id, message_id, ASK_PROMPTS[field], [[ui.button("‹ Отмена", "home")]])
        return

    if data == "run":
        tg.answer_callback(callback["id"], "Ищу…")
        run_search(db, chat_id, query)
        return

    # Then the edits. Each redraws the screen it was made on, so the change is
    # visible where the finger already is.
    screen = "home"

    if data.startswith("city:"):
        query.city = data.split(":", 1)[1]
        screen = "city"
    elif data.startswith("cat:"):
        query.category = data.split(":", 1)[1]
        screen = "category"
    elif data.startswith("lim:"):
        query.limit = int(data.split(":", 1)[1])
        screen = "limit"
    elif data.startswith("kw:"):
        for word in ui.KEYWORD_PRESETS[data.split(":", 1)[1]]:
            if word not in query.keywords:
                query.keywords.append(word)
        screen = "keywords"
    elif data == "kwclear":
        query.keywords = []
        screen = "keywords"
    elif data.startswith("src:"):
        source = data.split(":", 1)[1]
        if not configured_sources().get(source):
            tg.answer_callback(callback["id"], "Нет ключа — добавьте его в bot/.env")
            return
        if source in query.sources:
            query.sources.remove(source)
        else:
            query.sources.append(source)
        screen = "sources"
    else:
        tg.answer_callback(callback["id"])
        return

    save_query(db, chat_id, query)
    tg.answer_callback(callback["id"])
    show(db, chat_id, screen, message_id)


def handle_typed(db, chat_id: int, text: str) -> None:
    """A plain message either fills in what the bot asked for, or opens the menu."""
    field = get_pending(db, chat_id)
    if not field:
        show(db, chat_id, "home")
        return

    query = get_query(db, chat_id)
    if field == "city":
        query.city = text.strip()[:80]
    elif field == "keywords":
        query.keywords = [word.strip() for word in text.split(",") if word.strip()][:20]

    save_query(db, chat_id, query)
    set_pending(db, chat_id, None)
    show(db, chat_id, "home")


def handle_message(db, message: dict) -> None:
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return

    # Being added to or removed from a group arrives without any text.
    joined = message.get("new_chat_members") or []
    if joined and any(one.get("is_bot") and one.get("username") == BOT_USERNAME for one in joined):
        register_chat(db, chat_id, chat.get("title", ""))
        tg.send_message(
            chat_id,
            "Готов читать этот чат. Если ниже счётчик остаётся на нуле — в "
            "@BotFather выключите Group Privacy и добавьте меня заново.",
        )
        return
    left = message.get("left_chat_member") or {}
    if left.get("username") == BOT_USERNAME:
        forget_chat(db, chat_id)
        return

    text = (message.get("text") or "").strip()
    if not text:
        return

    sender = message.get("from") or {}
    author = f"@{sender['username']}" if sender.get("username") else sender.get("first_name", "—")
    in_group = chat.get("type") in ("group", "supergroup")

    if in_group and not text.startswith("/"):
        # Ordinary group chatter is the raw material. What reads like someone
        # looking to hire is kept; the rest is only counted, so a quiet chat can
        # be told apart from one the bot is not being shown.
        keep = tg_source.looks_like_intent(text)
        note_chat_activity(db, chat_id, chat.get("title", ""), kept=keep)
        if keep:
            remember_message(
                db,
                chat_id=chat_id,
                chat_title=chat.get("title", ""),
                chat_name=chat.get("username"),
                message_id=message["message_id"],
                author=author,
                author_url=f"https://t.me/{sender['username']}" if sender.get("username") else None,
                text=text,
                posted_at=message.get("date", int(time.time())),
            )
        return

    if ALLOWED_USERS and sender.get("id") not in ALLOWED_USERS:
        if text.startswith("/"):
            tg.send_message(chat_id, "Этот бот приватный.")
        return

    if text.startswith("/"):
        command = text.split()[0].split("@")[0].lower()
        set_pending(db, chat_id, None)
        if command == "/leads":
            run_search(db, chat_id, get_query(db, chat_id))
        elif command == "/help":
            show(db, chat_id, "help")
        else:
            show(db, chat_id, "home")
        return

    if not in_group:
        handle_typed(db, chat_id, text)


def check() -> int:
    """`--check`: says what the bot sees before it tries to do any work."""
    import ssl

    from config import CA_BUNDLE, INSECURE

    print(f"Python:        {sys.version.split()[0]}")
    print(f"Токен:         {'есть' if BOT_TOKEN else 'НЕТ — заполните bot/.env'}")
    print(f"LEADS_CA_BUNDLE: {CA_BUNDLE or '—'}")
    try:
        import certifi

        print(f"certifi:       {certifi.where()}")
    except ImportError:
        print(f"certifi:       не установлен, берутся системные "
              f"({ssl.get_default_verify_paths().cafile or 'по умолчанию'})")
    if INSECURE:
        print("ПРОВЕРКА СЕРТИФИКАТОВ ОТКЛЮЧЕНА (LEADS_INSECURE=1)")
    db = connect()
    print(f"Чатов на чтении: {len(watched_chats(db))}, сообщений в базе: {archive_size(db)}")
    for name, url in (
        ("api.telegram.org", "https://api.telegram.org"),
        ("api.vk.com", "https://api.vk.com/method/utils.getServerTime"),
    ):
        try:
            get_json(url)
            print(f"{name}: доступен")
        except TlsError as error:
            print(f"{name}: сертификат не проверился — {error}")
        except Exception as error:
            print(f"{name}: {error}")
    return 0


def main() -> int:
    if "--check" in sys.argv:
        return check()

    if not BOT_TOKEN:
        print(
            "Нет токена. Создайте бота в @BotFather и положите токен в bot/.env:\n"
            "  LEADS_BOT_TOKEN=123456:AA...",
            file=sys.stderr,
        )
        return 1

    db = connect()
    forget_old(db)

    try:
        # Polling and a webhook cannot both be active, so clear one if it is set.
        tg.delete_webhook()
        me = tg.get_me()
    except TlsError as error:
        print(f"Сертификат не прошёл проверку: {error}\n", file=sys.stderr)
        print(TLS_HELP, file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Не удалось подключиться к Telegram: {error}", file=sys.stderr)
        print(
            "Проверьте токен в bot/.env и доступ в интернет "
            "(api.telegram.org может быть заблокирован — нужен VPN или прокси).",
            file=sys.stderr,
        )
        return 1

    try:
        tg.set_commands(
            [
                {"command": "menu", "description": "Меню и настройки"},
                {"command": "leads", "description": "Найти лиды"},
                {"command": "help", "description": "Как это работает"},
            ]
        )
    except Exception as error:
        # Cosmetic: the bot works whether or not Telegram accepted the list.
        print(f"[commands] {error}")

    global BOT_USERNAME
    BOT_USERNAME = me.get("username") or ""

    print(f"Бот @{BOT_USERNAME} запущен. Ctrl-C — остановить.")
    for source, on in configured_sources().items():
        print(f"  {SOURCE_NAMES[source]}: {'готов' if on else 'нет ключа'}")

    offset = 0
    while True:
        try:
            updates = tg.get_updates(offset)
        except KeyboardInterrupt:
            raise
        except Exception as error:
            # A dropped connection is normal on a long poll; wait and carry on.
            print(f"[poll] {error}")
            time.sleep(3)
            continue

        for update in updates:
            offset = update["update_id"] + 1
            try:
                if update.get("callback_query"):
                    handle_callback(db, update["callback_query"])
                elif update.get("message"):
                    handle_message(db, update["message"])
            except Exception as error:
                # One bad update must never stop the bot.
                print(f"[update {update.get('update_id')}] {error}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nОстановлен.")
