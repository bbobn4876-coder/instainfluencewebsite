"""Per-chat settings and the Telegram messages the bot has seen.

SQLite, one file next to the bot. Nothing else to install or run.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from config import DB_PATH
from leads import DEFAULT_STOP_WORDS, SOURCES, Query

_SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
  chat_id  TEXT PRIMARY KEY,
  settings TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seen_messages (
  id         TEXT PRIMARY KEY,
  chat_id    TEXT NOT NULL,
  chat_title TEXT NOT NULL,
  chat_name  TEXT,
  author     TEXT NOT NULL,
  author_url TEXT,
  text       TEXT NOT NULL,
  posted_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS seen_by_time ON seen_messages (posted_at DESC);
CREATE TABLE IF NOT EXISTS watched_chats (
  chat_id   TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  seen      INTEGER NOT NULL DEFAULT 0,
  kept      INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pending (
  chat_id TEXT PRIMARY KEY,
  field   TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(_SCHEMA)
    return db


def get_query(db: sqlite3.Connection, chat_id: int | str) -> Query:
    row = db.execute("SELECT settings FROM chats WHERE chat_id = ?", (str(chat_id),)).fetchone()
    if not row:
        return Query()
    stored = json.loads(row["settings"])
    return Query(
        city=stored.get("city", "Санкт-Петербург"),
        category=stored.get("category", "beauty"),
        keywords=stored.get("keywords", []),
        sources=stored.get("sources", list(SOURCES)),
        limit=int(stored.get("limit", 10)),
        stop_words=stored.get("stop_words", list(DEFAULT_STOP_WORDS)),
    )


def save_query(db: sqlite3.Connection, chat_id: int | str, query: Query) -> None:
    payload = json.dumps(
        {
            "city": query.city,
            "category": query.category,
            "keywords": query.keywords,
            "sources": query.sources,
            "limit": query.limit,
            "stop_words": query.stop_words,
        },
        ensure_ascii=False,
    )
    db.execute(
        "INSERT INTO chats (chat_id, settings) VALUES (?, ?) "
        "ON CONFLICT (chat_id) DO UPDATE SET settings = excluded.settings",
        (str(chat_id), payload),
    )
    db.commit()


def remember_message(
    db: sqlite3.Connection,
    *,
    chat_id: int,
    chat_title: str,
    chat_name: str | None,
    message_id: int,
    author: str,
    author_url: str | None,
    text: str,
    posted_at: int,
) -> None:
    db.execute(
        "INSERT OR IGNORE INTO seen_messages "
        "(id, chat_id, chat_title, chat_name, author, author_url, text, posted_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            f"{chat_id}:{message_id}",
            str(chat_id),
            chat_title,
            chat_name,
            author,
            author_url,
            text,
            posted_at,
        ),
    )
    db.commit()


def recent_messages(db: sqlite3.Connection, days: int = 30, limit: int = 500) -> list[sqlite3.Row]:
    since = int(time.time()) - days * 86_400
    return list(
        db.execute(
            "SELECT * FROM seen_messages WHERE posted_at >= ? ORDER BY posted_at DESC LIMIT ?",
            (since, limit),
        )
    )


def forget_old(db: sqlite3.Connection, days: int = 60) -> None:
    """Nothing is kept forever; the archive is only there to search over."""
    db.execute("DELETE FROM seen_messages WHERE posted_at < ?", (int(time.time()) - days * 86_400,))
    db.commit()


# ---------------------------------------------------------------- watched chats


def note_chat_activity(
    db: sqlite3.Connection, chat_id: int, title: str, *, kept: bool
) -> None:
    """Counts what the bot is actually shown in a group.

    Zero messages seen is the tell that Group Privacy is still on — without this
    there is no way to tell that apart from a quiet chat.
    """
    db.execute(
        "INSERT INTO watched_chats (chat_id, title, seen, kept, last_seen) "
        "VALUES (?, ?, 1, ?, ?) "
        "ON CONFLICT (chat_id) DO UPDATE SET "
        "  title = excluded.title,"
        "  seen = watched_chats.seen + 1,"
        "  kept = watched_chats.kept + excluded.kept,"
        "  last_seen = excluded.last_seen",
        (str(chat_id), title, 1 if kept else 0, int(time.time())),
    )
    db.commit()


def register_chat(db: sqlite3.Connection, chat_id: int, title: str) -> None:
    """Notes a group the bot was just added to, with nothing seen yet.

    Telegram delivers the "bot was added" service message even when Group
    Privacy is on — which is exactly the case where no ordinary message ever
    arrives. A row here with seen = 0 is what tells the two apart.
    """
    db.execute(
        "INSERT INTO watched_chats (chat_id, title, seen, kept, last_seen) "
        "VALUES (?, ?, 0, 0, ?) "
        "ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title",
        (str(chat_id), title, int(time.time())),
    )
    db.commit()


def forget_chat(db: sqlite3.Connection, chat_id: int) -> None:
    db.execute("DELETE FROM watched_chats WHERE chat_id = ?", (str(chat_id),))
    db.commit()


def watched_chats(db: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(db.execute("SELECT * FROM watched_chats ORDER BY kept DESC, seen DESC"))


def archive_size(db: sqlite3.Connection) -> int:
    return db.execute("SELECT COUNT(*) AS n FROM seen_messages").fetchone()["n"]


# -------------------------------------------------------------- pending input


def set_pending(db: sqlite3.Connection, chat_id: int | str, field: str | None) -> None:
    """Which setting the next plain message fills in, if any."""
    if field is None:
        db.execute("DELETE FROM pending WHERE chat_id = ?", (str(chat_id),))
    else:
        db.execute(
            "INSERT INTO pending (chat_id, field) VALUES (?, ?) "
            "ON CONFLICT (chat_id) DO UPDATE SET field = excluded.field",
            (str(chat_id), field),
        )
    db.commit()


def get_pending(db: sqlite3.Connection, chat_id: int | str) -> str | None:
    row = db.execute("SELECT field FROM pending WHERE chat_id = ?", (str(chat_id),)).fetchone()
    return row["field"] if row else None
