"""Экраны бота: что показано и какие кнопки под этим.

Каждый экран — это (текст, клавиатура). Одно сообщение живёт как меню и
переписывается на месте, поэтому чат не засоряется: нажатие не добавляет
сообщение, а меняет текущее.

Команд по сути две: /start и /menu. Всё остальное делается кнопками.
"""

from __future__ import annotations

import sqlite3

from config import configured_sources
from leads import CATEGORIES, SOURCE_NAMES, SOURCES, Query
from storage import archive_size, watched_chats
from telegram_api import esc

# Что показывать вместо английских ключей категорий.
CATEGORY_NAMES = {
    "restaurants": "Рестораны и кафе",
    "beauty": "Красота",
    "fitness": "Фитнес",
    "clinics": "Клиники",
    "auto": "Авто",
    "retail": "Магазины",
    "hotels": "Отели",
    "events": "Мероприятия",
    "education": "Обучение",
    "realestate": "Недвижимость",
}

# Города под рукой — остальные вводятся текстом.
QUICK_CITIES = [
    "Санкт-Петербург",
    "Москва",
    "Новосибирск",
    "Екатеринбург",
    "Казань",
    "Краснодар",
    "Нижний Новгород",
    "Сочи",
]

LIMITS = [5, 10, 15, 20, 25]

# Готовые наборы слов, чтобы не печатать их руками.
KEYWORD_PRESETS = {
    "смм": ["нужен смм", "ищу смм", "ведение соцсетей"],
    "видео": ["видеограф", "монтаж", "нужны рилс", "съёмка"],
    "таргет": ["таргетолог", "настроить рекламу", "трафик"],
    "сайт": ["нужен сайт", "лендинг", "разработка сайта"],
}


def button(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data}


def rows(buttons: list[dict], per_row: int) -> list[list[dict]]:
    return [buttons[i : i + per_row] for i in range(0, len(buttons), per_row)]


def _source_line(query: Query) -> str:
    configured = configured_sources()
    on = [SOURCE_NAMES[one] for one in query.sources if configured[one]]
    return ", ".join(on) if on else "не выбраны"


# ------------------------------------------------------------------ главный экран


def home(query: Query, db: sqlite3.Connection) -> tuple[str, list[list[dict]]]:
    stored = archive_size(db)
    text = "\n".join(
        [
            "<b>Поиск лидов</b>",
            "",
            f"🏙 Город: <b>{esc(query.city or '—')}</b>",
            f"🗂 Категория: <b>{CATEGORY_NAMES.get(query.category, query.category)}</b>",
            f"🔑 Слова: <b>{esc(', '.join(query.keywords) or 'по умолчанию')}</b>",
            f"📡 Источники: <b>{esc(_source_line(query))}</b>",
            f"🔢 Присылать: <b>{query.limit}</b>",
            "",
            f"<i>В базе Telegram: {stored} сообщений</i>",
        ]
    )
    keyboard = [
        [button("🔎 Найти лиды", "run")],
        [button("🏙 Город", "screen:city"), button("🗂 Категория", "screen:category")],
        [button("🔑 Слова", "screen:keywords"), button("🔢 Сколько", "screen:limit")],
        [button("📡 Источники", "screen:sources"), button("💬 Чаты", "screen:chats")],
        [button("❓ Как это работает", "screen:help")],
    ]
    return text, keyboard


# ------------------------------------------------------------------- настройки


def city_screen(query: Query) -> tuple[str, list[list[dict]]]:
    text = (
        f"<b>Город</b>\n\nСейчас: <b>{esc(query.city or '—')}</b>\n\n"
        "Выберите из списка или пришлите свой город сообщением."
    )
    buttons = [
        button(f"{'✅ ' if city == query.city else ''}{city}", f"city:{city}")
        for city in QUICK_CITIES
    ]
    keyboard = rows(buttons, 2)
    keyboard.append([button("✏️ Ввести свой", "ask:city")])
    keyboard.append([button("‹ Назад", "home")])
    return text, keyboard


def category_screen(query: Query) -> tuple[str, list[list[dict]]]:
    text = (
        "<b>Категория</b>\n\nОт неё зависит, что искать в 2ГИС, ВК и по хэштегам "
        "в Instagram."
    )
    buttons = [
        button(
            f"{'✅ ' if one == query.category else ''}{CATEGORY_NAMES[one]}",
            f"cat:{one}",
        )
        for one in CATEGORIES
    ]
    keyboard = rows(buttons, 2)
    keyboard.append([button("‹ Назад", "home")])
    return text, keyboard


def keywords_screen(query: Query) -> tuple[str, list[list[dict]]]:
    text = "\n".join(
        [
            "<b>Ключевые слова</b>",
            "",
            f"Сейчас: <b>{esc(', '.join(query.keywords) or 'по умолчанию')}</b>",
            "",
            "По ним ищутся посты в ВК и сообщения в чатах. Наборы ниже можно "
            "сложить друг с другом, или пришлите свои слова через запятую.",
        ]
    )
    buttons = [button(f"+ {name}", f"kw:{name}") for name in KEYWORD_PRESETS]
    keyboard = rows(buttons, 2)
    keyboard.append([button("✏️ Свои слова", "ask:keywords")])
    keyboard.append([button("🗑 Очистить", "kwclear"), button("‹ Назад", "home")])
    return text, keyboard


def limit_screen(query: Query) -> tuple[str, list[list[dict]]]:
    text = (
        f"<b>Сколько лидов присылать</b>\n\nСейчас: <b>{query.limit}</b>\n\n"
        "Каждый лид — отдельное сообщение."
    )
    buttons = [
        button(f"{'✅ ' if one == query.limit else ''}{one}", f"lim:{one}") for one in LIMITS
    ]
    keyboard = [buttons, [button("‹ Назад", "home")]]
    return text, keyboard


def sources_screen(query: Query) -> tuple[str, list[list[dict]]]:
    configured = configured_sources()
    missing = [SOURCE_NAMES[one] for one, on in configured.items() if not on]

    lines = ["<b>Источники</b>", "", "Нажмите, чтобы включить или выключить."]
    if missing:
        lines += [
            "",
            f"🔒 {esc(', '.join(missing))} — нет ключа в <code>bot/.env</code>, "
            "поэтому не запускаются.",
        ]

    keyboard = []
    for source in SOURCES:
        if not configured[source]:
            mark = "🔒"
        elif source in query.sources:
            mark = "✅"
        else:
            mark = "▫️"
        keyboard.append([button(f"{mark} {SOURCE_NAMES[source]}", f"src:{source}")])
    keyboard.append([button("‹ Назад", "home")])
    return "\n".join(lines), keyboard


# ------------------------------------------------------------------- чаты и help


def chats_screen(db: sqlite3.Connection) -> tuple[str, list[list[dict]]]:
    """Видит ли бот чаты — единственный способ это проверить."""
    chats = watched_chats(db)
    lines = ["<b>Чаты, которые читает бот</b>", ""]

    if not chats:
        lines += [
            "Пока ни одного.",
            "",
            "Источник Telegram ищет <b>только по сообщениям тех групп, куда "
            "добавлен этот бот</b>. Глобального поиска по Telegram у ботов нет.",
            "",
            "<b>Что сделать:</b>",
            "1. Добавьте бота в рабочие чаты, где ищут подрядчиков.",
            "2. Выключите Group Privacy: @BotFather → /mybots → ваш бот → "
            "Bot Settings → Group Privacy → Turn off.",
            "3. <b>Удалите и добавьте бота в чат заново</b> — без этого старая "
            "настройка остаётся в силе.",
            "",
            "Дальше он сам накопит сообщения, похожие на поиск подрядчика.",
        ]
    else:
        for chat in chats:
            lines.append(f"• <b>{esc(chat['title'] or chat['chat_id'])}</b> — "
                         f"видел {chat['seen']}, подходящих {chat['kept']}")
        silent = [one for one in chats if one["seen"] == 0]
        if silent:
            lines += ["", "Где видел 0 — включён Group Privacy, бот не получает сообщения."]
        lines += ["", "Бот хранит только сообщения, похожие на поиск подрядчика."]

    return "\n".join(lines), [[button("‹ Назад", "home")]]


def help_screen() -> tuple[str, list[list[dict]]]:
    text = "\n".join(
        [
            "<b>Как это работает</b>",
            "",
            "<b>Telegram</b> — бот читает группы, куда его добавили, и запоминает "
            "сообщения вида «ищу смм», «нужен видеограф». Поиск идёт по ним. "
            "Ключей не требует, но и чужие чаты сам не находит.",
            "",
            "<b>ВКонтакте</b> — официальное API: посты, где ищут подрядчика, и "
            "группы бизнеса с заброшенной стеной.",
            "",
            "<b>2ГИС</b> — компании с рейтингом и телефоном, но без соцсетей.",
            "",
            "<b>Instagram</b> — профили по хэштегам города и ниши. Каждый профиль "
            "— платный запрос.",
            "",
            "Авито нет: открытого API у него нет, а единственный путь — обход "
            "защиты от ботов.",
            "",
            "<b>Приоритет</b> лида — сумма сигналов: просит подрядчика 55, "
            "заброшена лента 20, нет видео 15, нет соцсетей 12, устойчивый "
            "бизнес 10.",
        ]
    )
    return text, [[button("‹ Назад", "home")]]
