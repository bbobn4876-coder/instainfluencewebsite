"""Local businesses from 2GIS's catalog API — the published route, with a key,
rather than scraping the map.

A company with a good rating, a phone and no social link is the lead worth a
call: established enough to pay, invisible enough to need help.
"""

from __future__ import annotations

from config import DGIS_API_KEY
from leads import CATEGORY_TERMS, Lead, Query
from web import get_json

API = "https://catalog.api.2gis.com/3.0/items"

SOCIAL = {"instagram", "telegram", "vkontakte", "vk", "facebook", "youtube"}


def _contacts(item: dict) -> tuple[list[str], list[str], list[dict[str, str]]]:
    phones: list[str] = []
    emails: list[str] = []
    links: list[dict[str, str]] = []

    for group in item.get("contact_groups") or []:
        for contact in group.get("contacts") or []:
            value = contact.get("value") or contact.get("text") or contact.get("url") or ""
            if not value:
                continue
            kind = contact.get("type")
            if kind == "phone":
                phones.append(value)
            elif kind == "email":
                emails.append(value)
            elif kind in SOCIAL:
                links.append({"platform": kind, "url": contact.get("url") or value})
            elif kind == "website":
                links.append({"platform": "website", "url": contact.get("url") or value})

    return phones, emails, links


def find(query: Query) -> list[Lead]:
    if not DGIS_API_KEY:
        return []

    term = " ".join(
        filter(None, [CATEGORY_TERMS.get(query.category, query.category), *query.keywords])
    ) or "услуги"
    body = get_json(
        API,
        {
            "q": f"{term} {query.city}".strip(),
            "page_size": min(50, max(1, query.limit)),
            "fields": "items.contact_groups,items.reviews,items.address",
            "key": DGIS_API_KEY,
        },
    )

    leads: list[Lead] = []
    for item in ((body or {}).get("result") or {}).get("items") or []:
        phones, emails, links = _contacts(item)
        reviews = item.get("reviews") or {}
        rating = reviews.get("general_rating") or 0
        social = [link for link in links if link["platform"] in SOCIAL]

        signals: list[str] = []
        if not social:
            signals.append("noSocial")
        if rating >= 4.2 and (reviews.get("general_review_count") or 0) >= 20:
            signals.append("highRating")

        leads.append(
            Lead(
                id=f"maps:{item['id']}",
                source="maps",
                name=item.get("name", ""),
                context=" · ".join(
                    filter(None, [item.get("address_name"), f"рейтинг {rating:.1f}" if rating else ""])
                ),
                url=f"https://2gis.ru/firm/{item['id']}",
                city=query.city,
                category=query.category,
                phones=phones,
                emails=emails,
                links=links,
                signals=signals,
            )
        )
    return leads
