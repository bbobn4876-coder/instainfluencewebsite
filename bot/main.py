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
from config import ALLOWED_USERS, BOT_TOKEN, configured_sources
from leads import (
    CATEGORIES,
    SIGNAL_NAMES,
    SOURCE_NAMES,
    SOURCES,
    Lead,
    Query,
    clean,
)
from sources import instagram as ig_source
from sources import maps as maps_source
from sources import telegram as tg_source
from sources import vk as vk_source
from storage import connect, forget_old, get_query, remember_message, save_query
from web import TlsError, get_json

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

HELP = """<b>Лиды</b>

/leads — найти лиды по текущим настройкам
/sources — выбрать источники
/city Москва — город
/category beauty — категория
/keywords нужен смм, ищу видеографа — ключевые слова
/limit 10 — сколько лидов присылать
/status — текущие настройки
/help — эта справка

Добавьте бота в рабочие чаты — он запомнит сообщения, похожие на поиск подрядчика, и они попадут в выдачу."""


def source_keyboard(query: Query) -> list[list[dict]]:
    """Two per row, with what is on and what has no key."""
    configured = configured_sources()
    rows: list[list[dict]] = []
    for source in SOURCES:
        if not configured[source]:
            mark = "🔒"
        elif source in query.sources:
            mark = "✅"
        else:
            mark = "▫️"
        button = {"text": f"{mark} {SOURCE_NAMES[source]}", "callback_data": f"src:{source}"}
        if rows and len(rows[-1]) < 2:
            rows[-1].append(button)
        else:
            rows.append([button])
    rows.append([{"text": "Искать", "callback_data": "run"}])
    return rows


def status_text(query: Query) -> str:
    configured = configured_sources()
    lines = [
        "<b>Настройки</b>",
        f"Город: {tg.esc(query.city)}",
        f"Категория: {tg.esc(query.category)}",
        f"Ключевые слова: {tg.esc(', '.join(query.keywords) or '—')}",
        f"Лидов за раз: {query.limit}",
        "",
        "<b>Источники</b>",
    ]
    for source in SOURCES:
        if not configured[source]:
            lines.append(f"🔒 {SOURCE_NAMES[source]} — нет ключа")
        else:
            mark = "✅" if source in query.sources else "▫️"
            lines.append(f"{mark} {SOURCE_NAMES[source]}")
    return "\n".join(lines)


def format_lead(lead: Lead, index: int, total: int) -> str:
    lines = [
        f"<b>{tg.esc(lead.name)}</b> · {lead.priority}/100",
        f"{SOURCE_NAMES[lead.source]}" + (f" · {tg.esc(lead.city)}" if lead.city else ""),
    ]
    if lead.context:
        lines += ["", tg.esc(lead.context[:500])]

    if lead.signals:
        named = ", ".join(SIGNAL_NAMES.get(signal, signal) for signal in lead.signals)
        lines += ["", f"🎯 {tg.esc(named)}"]

    contacts = [f"✉️ {tg.esc(one)}" for one in lead.emails]
    contacts += [f"📞 {tg.esc(one)}" for one in lead.phones]
    if contacts:
        lines += [""] + contacts

    if lead.url:
        lines += ["", f'<a href="{tg.esc(lead.url)}">Открыть</a>']
    for link in lead.links[:3]:
        lines.append(f"{tg.esc(link['platform'])}: {tg.esc(link['url'])}")

    lines += ["", f"<i>{index + 1} из {total}</i>"]
    return "\n".join(lines)


def run_search(db, chat_id: int, query: Query) -> None:
    configured = configured_sources()
    live = [source for source in query.sources if configured[source]]
    if not live:
        tg.send_message(chat_id, "Не выбран ни один доступный источник. /sources")
        return

    tg.send_message(chat_id, f"Ищу: {', '.join(SOURCE_NAMES[one] for one in live)}…")

    found: list[Lead] = []
    problems: list[str] = []

    # Telegram reads the local database, so it stays on this thread; the three
    # network sources run together, because each one waits on someone else.
    if "telegram" in live:
        try:
            found += tg_source.find(query, db)
        except Exception as error:
            problems.append(f"Telegram: {error}")

    runners = {
        "vk": vk_source.find,
        "maps": maps_source.find,
        "instagram": ig_source.find,
    }
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

    head = [f"Найдено: <b>{len(leads)}</b>"]
    skipped = [SOURCE_NAMES[one] for one in query.sources if one not in live]
    if skipped:
        head.append(f"Без ключа, не запускались: {', '.join(skipped)}")
    head += [tg.esc(problem) for problem in problems]
    if not leads and not problems:
        head.append("Попробуйте другие ключевые слова, город или источник.")
    tg.send_message(chat_id, "\n".join(head))

    for index, lead in enumerate(leads):
        tg.send_message(chat_id, format_lead(lead, index, len(leads)))
        # Telegram drops messages sent faster than about one per second per chat.
        time.sleep(0.4)


def handle_command(db, chat_id: int, text: str) -> None:
    raw, _, argument = text.partition(" ")
    command = raw.split("@")[0].lower()
    argument = argument.strip()
    query = get_query(db, chat_id)

    if command in ("/start", "/help"):
        tg.send_message(chat_id, HELP)

    elif command == "/status":
        tg.send_message(chat_id, status_text(query))

    elif command == "/sources":
        tg.send_message(chat_id, "Источники:", source_keyboard(query))

    elif command == "/city":
        if not argument:
            tg.send_message(chat_id, "Например: <code>/city Москва</code>")
            return
        query.city = argument
        save_query(db, chat_id, query)
        tg.send_message(chat_id, f"Город: {tg.esc(argument)}")

    elif command == "/category":
        wanted = argument.lower()
        if wanted not in CATEGORIES:
            listed = ", ".join(f"<code>{one}</code>" for one in CATEGORIES)
            tg.send_message(chat_id, f"Категории: {listed}")
            return
        query.category = wanted
        save_query(db, chat_id, query)
        tg.send_message(chat_id, f"Категория: {wanted}")

    elif command == "/keywords":
        query.keywords = [word.strip() for word in argument.split(",") if word.strip()]
        save_query(db, chat_id, query)
        tg.send_message(
            chat_id,
            f"Ключевые слова: {tg.esc(', '.join(query.keywords))}"
            if query.keywords
            else "Ключевые слова очищены.",
        )

    elif command == "/limit":
        if not argument.isdigit() or int(argument) < 1:
            tg.send_message(chat_id, "Например: <code>/limit 10</code>")
            return
        # Each lead is its own message, so a big number floods the chat and
        # runs into Telegram's rate limit.
        query.limit = min(25, int(argument))
        save_query(db, chat_id, query)
        tg.send_message(chat_id, f"Лидов за раз: {query.limit}")

    elif command == "/leads":
        run_search(db, chat_id, query)

    else:
        tg.send_message(chat_id, HELP)


def handle_callback(db, callback: dict) -> None:
    message = callback.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    if not chat_id:
        tg.answer_callback(callback["id"])
        return

    data = callback.get("data") or ""
    query = get_query(db, chat_id)

    if data == "run":
        tg.answer_callback(callback["id"], "Ищу…")
        run_search(db, chat_id, query)
        return

    if data.startswith("src:"):
        source = data[4:]
        if source not in SOURCES:
            tg.answer_callback(callback["id"], "Неизвестный источник.")
            return
        if not configured_sources()[source]:
            tg.answer_callback(callback["id"], "Для этого источника нет ключа.")
            return
        if source in query.sources:
            query.sources.remove(source)
        else:
            query.sources.append(source)
        save_query(db, chat_id, query)
        tg.answer_callback(callback["id"])
        tg.edit_message(chat_id, message["message_id"], "Источники:", source_keyboard(query))
        return

    tg.answer_callback(callback["id"])


def handle_message(db, message: dict) -> None:
    chat = message.get("chat") or {}
    text = (message.get("text") or "").strip()
    if not text:
        return

    sender = message.get("from") or {}
    author = f"@{sender['username']}" if sender.get("username") else sender.get("first_name", "—")

    if chat.get("type") in ("group", "supergroup"):
        # Ordinary group chatter is the raw material: keep what reads like
        # someone looking to hire, and let a search read back over it.
        if not text.startswith("/") and tg_source.looks_like_intent(text):
            remember_message(
                db,
                chat_id=chat["id"],
                chat_title=chat.get("title", ""),
                chat_name=chat.get("username"),
                message_id=message["message_id"],
                author=author,
                author_url=f"https://t.me/{sender['username']}" if sender.get("username") else None,
                text=text,
                posted_at=message.get("date", int(time.time())),
            )

    if not text.startswith("/"):
        if chat.get("type") == "private":
            tg.send_message(chat["id"], HELP)
        return

    if ALLOWED_USERS and sender.get("id") not in ALLOWED_USERS:
        tg.send_message(chat["id"], "Этот бот приватный.")
        return

    handle_command(db, chat["id"], text)


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

    print(f"Бот @{me.get('username')} запущен. Ctrl-C — остановить.")
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
