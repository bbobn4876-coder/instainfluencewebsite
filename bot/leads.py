"""The lead model shared by every source.

Same shape, weights and cleaning as the web app's lib/leads.ts, so the two can
be compared side by side and neither drifts.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

SOURCES = ["telegram", "vk", "maps", "instagram"]

SOURCE_NAMES = {
    "telegram": "Telegram",
    "vk": "ВКонтакте",
    "maps": "2ГИС / Карты",
    "instagram": "Instagram",
}

# Avito is deliberately absent: it publishes no API for this, and the only way
# in is defeating its bot protection. That is not built here.

SIGNAL_NAMES = {
    "asking": "ищет подрядчика",
    "stale": "лента заброшена",
    "noVideo": "нет видео",
    "noSocial": "нет соцсетей",
    "highRating": "устойчивый бизнес",
}

# Someone asking out loud outranks a business that merely looks neglected.
SIGNAL_WEIGHT = {"asking": 55, "stale": 20, "noVideo": 15, "noSocial": 12, "highRating": 10}

DEFAULT_STOP_WORDS = ["агентство", "вакансия", "стажировка", "обучение", "курс", "инфобиз"]

CATEGORIES = [
    "restaurants",
    "beauty",
    "fitness",
    "clinics",
    "auto",
    "retail",
    "hotels",
    "events",
    "education",
    "realestate",
]

# What a category is actually called in a Russian search box.
CATEGORY_TERMS = {
    "restaurants": "ресторан кафе",
    "beauty": "салон красоты",
    "fitness": "фитнес клуб",
    "clinics": "клиника",
    "auto": "автосервис",
    "retail": "магазин",
    "hotels": "отель гостиница",
    "events": "организация мероприятий",
    "education": "школа курсы",
    "realestate": "агентство недвижимости",
}


def priority_of(signals: list[str]) -> int:
    return min(100, sum(SIGNAL_WEIGHT.get(signal, 0) for signal in signals))


@dataclass
class Lead:
    id: str
    source: str
    name: str
    context: str
    url: str
    city: str = ""
    category: str = ""
    phones: list[str] = field(default_factory=list)
    emails: list[str] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    signals: list[str] = field(default_factory=list)
    found_at: float = field(default_factory=time.time)

    @property
    def priority(self) -> int:
        return priority_of(self.signals)


@dataclass
class Query:
    """What to look for. One per chat, edited by the bot's commands."""

    city: str = "Санкт-Петербург"
    category: str = "beauty"
    keywords: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=lambda: list(SOURCES))
    limit: int = 10
    stop_words: list[str] = field(default_factory=lambda: list(DEFAULT_STOP_WORDS))


def clean(leads: list[Lead], stop_words: list[str]) -> list[Lead]:
    """Drops anything matching a stop word, and anything seen twice."""
    blocked = [word.strip().lower() for word in stop_words if word.strip()]
    seen: set[str] = set()
    out: list[Lead] = []

    for lead in leads:
        haystack = f"{lead.name} {lead.context}".lower()
        if any(word in haystack for word in blocked):
            continue
        # The same business can surface from two sources at once.
        key = lead.url or f"{lead.source}:{lead.name}"
        if key in seen:
            continue
        seen.add(key)
        out.append(lead)

    return sorted(out, key=lambda lead: lead.priority, reverse=True)
