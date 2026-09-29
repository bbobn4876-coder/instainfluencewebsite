"""Telegram: the chats the bot itself sits in.

The bot is already long-polling, so every group message it is shown passes
through this process. Messages that read like someone looking for a contractor
are kept in the local database, and a search reads back over them.

This is the honest version of the idea: no userbot signed in as a person, no
closed chats it was not invited to. Add the bot to a chat and it sees what the
members see, with the group's knowledge.
"""

from __future__ import annotations

import sqlite3

from contacts import extract_emails, extract_links, extract_phones
from leads import Lead, Query
from storage import recent_messages

# Words that mean someone is looking to hire, not just chatting.
INTENT = [
    "ищу",
    "ищем",
    "нужен",
    "нужна",
    "нужно",
    "требуется",
    "посоветуйте",
    "порекомендуйте",
    "подрядчик",
    "смм",
    "smm",
    "таргет",
    "рилс",
    "reels",
    "видеограф",
    "монтаж",
    "продвижение",
]


def looks_like_intent(text: str, keywords: list[str] | None = None) -> bool:
    lower = text.lower()
    wanted = INTENT + [word.lower() for word in (keywords or [])]
    return any(word in lower for word in wanted)


def message_link(chat_name: str | None, chat_id: str, message_id: str) -> str:
    if chat_name:
        return f"https://t.me/{chat_name}/{message_id}"
    # Private groups address by the -100-prefixed id with that prefix removed.
    internal = str(chat_id)
    if internal.startswith("-100"):
        internal = internal[4:]
    return f"https://t.me/c/{internal}/{message_id}"


def find(query: Query, db: sqlite3.Connection) -> list[Lead]:
    leads: list[Lead] = []

    for row in recent_messages(db):
        text = row["text"]
        if not looks_like_intent(text, query.keywords):
            continue

        message_id = row["id"].split(":")[-1]
        leads.append(
            Lead(
                id=f"telegram:{row['id']}",
                source="telegram",
                name=row["author"],
                context=" ".join(text.split())[:400],
                url=message_link(row["chat_name"], row["chat_id"], message_id),
                city=query.city,
                category=query.category,
                phones=extract_phones(text),
                emails=extract_emails(text),
                links=(
                    [{"platform": "telegram", "url": row["author_url"]}] if row["author_url"] else []
                ),
                signals=["asking"],
                found_at=row["posted_at"],
            )
        )

    return leads[: query.limit]
