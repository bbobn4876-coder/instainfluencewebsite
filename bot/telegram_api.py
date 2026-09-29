"""The Bot API calls this bot makes. Long polling, so nothing needs a public
URL, a webhook or a server — it runs from a laptop.
"""

from __future__ import annotations

import html
from typing import Any

from config import BOT_TOKEN
from web import HttpError, post_json

API = "https://api.telegram.org"


def call(method: str, payload: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
    try:
        body = post_json(f"{API}/bot{BOT_TOKEN}/{method}", payload or {}, timeout=timeout)
    except HttpError as error:
        if error.status == 401:
            raise RuntimeError("Telegram не принял токен. Проверьте LEADS_BOT_TOKEN.") from None
        raise RuntimeError(f"Telegram {error.status}: {error.body[:150]}") from None
    if not body or not body.get("ok"):
        raise RuntimeError((body or {}).get("description", "Telegram отказал"))
    return body.get("result")


def get_me() -> dict:
    return call("getMe")


def get_updates(offset: int, timeout: int = 30) -> list[dict]:
    # The read timeout must outlast the long poll, or every poll looks like a
    # network failure.
    return call(
        "getUpdates",
        {"offset": offset, "timeout": timeout, "allowed_updates": ["message", "callback_query"]},
        timeout=timeout + 10,
    )


def send_message(chat_id: int | str, text: str, keyboard: list[list[dict]] | None = None) -> None:
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}
    call("sendMessage", payload)


def edit_message(chat_id: int | str, message_id: int, text: str, keyboard: list[list[dict]] | None = None) -> None:
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}
    try:
        call("editMessageText", payload)
    except RuntimeError as error:
        # Tapping the same button twice changes nothing, and Telegram says so.
        if "not modified" not in str(error):
            raise


def answer_callback(callback_id: str, text: str | None = None) -> None:
    call("answerCallbackQuery", {"callback_query_id": callback_id, **({"text": text} if text else {})})


def set_commands(commands: list[dict[str, str]]) -> None:
    """What Telegram lists in the ⌘ menu next to the input box."""
    call("setMyCommands", {"commands": commands})


def delete_webhook() -> None:
    """Polling and a webhook cannot both be active; the webhook wins otherwise."""
    call("deleteWebhook", {"drop_pending_updates": False})


def esc(value: str) -> str:
    return html.escape(value or "", quote=False)
