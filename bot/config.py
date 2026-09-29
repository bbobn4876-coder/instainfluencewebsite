"""Configuration, from the environment or a .env file next to this package.

Everything but the bot token is optional: with no source keys the bot still
runs, reads Telegram chats it is in, and says plainly which sources are off.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent / ".env"


def load_env() -> None:
    """Reads bot/.env without any dependency. Real env vars win."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()

BOT_TOKEN = os.environ.get("LEADS_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN") or ""

VK_SERVICE_TOKEN = os.environ.get("VK_SERVICE_TOKEN", "")
DGIS_API_KEY = os.environ.get("DGIS_API_KEY", "")
HIKER_TOKEN = os.environ.get("HIKER_TOKEN", "")

# Profiles read per Instagram run. Each one is a billed HikerAPI request, so
# this is the knob that decides what a search costs.
IG_PROFILE_BUDGET = int(os.environ.get("LEADS_IG_PROFILES", "40"))

# Telegram user ids allowed to command the bot. Empty means anyone who finds it.
ALLOWED_USERS = {
    int(one) for one in os.environ.get("ALLOWED_USERS", "").replace(",", " ").split() if one.strip()
}

DB_PATH = os.environ.get("LEADS_DB", str(Path(__file__).resolve().parent / "leads.sqlite3"))

HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "20"))


def configured_sources() -> dict[str, bool]:
    """Which sources have their credential in place. Telegram needs none."""
    return {
        "telegram": True,
        "vk": bool(VK_SERVICE_TOKEN),
        "maps": bool(DGIS_API_KEY),
        "instagram": bool(HIKER_TOKEN),
    }
