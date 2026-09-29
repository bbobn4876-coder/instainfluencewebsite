"""VK, through its own API — no scraping, so nothing to get banned for.

Two modes: posts where someone is asking for a contractor, and local business
groups whose wall has gone quiet.
"""

from __future__ import annotations

import time

from contacts import extract_emails, extract_links, extract_phones
from config import VK_SERVICE_TOKEN
from web import get_json
from leads import CATEGORY_TERMS, Lead, Query

API = "https://api.vk.com/method"
VERSION = "5.199"

# A wall that has not moved in this long is a business with a problem.
STALE_DAYS = 21


def _call(method: str, params: dict[str, object]) -> dict | None:
    body = get_json(
        f"{API}/{method}",
        {**params, "access_token": VK_SERVICE_TOKEN, "v": VERSION},
    )
    if isinstance(body, dict) and body.get("error"):
        raise RuntimeError(f"VK: {body['error'].get('error_msg', 'запрос отклонён')}")
    return (body or {}).get("response")


def _days_since(unix: int) -> float:
    return (time.time() - unix) / 86_400


def _asking(query: Query) -> list[Lead]:
    phrase = " ".join([*query.keywords, query.city]).strip()
    if not phrase:
        return []

    found = _call("newsfeed.search", {"q": phrase, "count": min(200, query.limit * 4), "extended": 0})
    leads: list[Lead] = []
    for post in (found or {}).get("items", []):
        text = (post.get("text") or "").strip()
        if len(text) <= 20:
            continue
        owner = post.get("from_id") or post.get("owner_id") or 0
        leads.append(
            Lead(
                id=f"vk:post:{owner}_{post['id']}",
                source="vk",
                name=f"vk.com/id{abs(owner)}",
                context=" ".join(text.split())[:400],
                url=f"https://vk.com/wall{owner}_{post['id']}",
                city=query.city,
                category=query.category,
                phones=extract_phones(text),
                emails=extract_emails(text),
                links=extract_links(text),
                signals=["asking"],
                found_at=post.get("date", time.time()),
            )
        )
    return leads


def _neglected(query: Query) -> list[Lead]:
    term = " ".join(
        filter(None, [CATEGORY_TERMS.get(query.category, query.category), query.city])
    ).strip()
    if not term:
        return []

    found = _call("groups.search", {"q": term, "type": "group", "count": min(100, query.limit * 4)})
    leads: list[Lead] = []

    # One wall read per group, and the list is capped so a run stays quick.
    for group in (found or {}).get("items", [])[:25]:
        try:
            wall = _call("wall.get", {"owner_id": -group["id"], "count": 5})
        except Exception:
            continue

        items = (wall or {}).get("items", [])
        last = items[0] if items else None
        signals: list[str] = []
        if not last or _days_since(last["date"]) > STALE_DAYS:
            signals.append("stale")
        if not last:
            signals.append("noSocial")
        if (group.get("members_count") or 0) > 500:
            signals.append("highRating")
        if not signals:
            continue

        leads.append(
            Lead(
                id=f"vk:group:{group['id']}",
                source="vk",
                name=group.get("name", f"club{group['id']}"),
                context=(
                    f"Последний пост {round(_days_since(last['date']))} дн. назад"
                    if last
                    else "На стене нет постов"
                ),
                url=f"https://vk.com/{group.get('screen_name') or 'club' + str(group['id'])}",
                city=(group.get("city") or {}).get("title") or query.city,
                category=query.category,
                signals=signals,
            )
        )
    return leads


def find(query: Query) -> list[Lead]:
    if not VK_SERVICE_TOKEN:
        return []
    leads: list[Lead] = []
    for mode in (_asking, _neglected):
        try:
            leads.extend(mode(query))
        except Exception as error:
            # One mode failing must not sink the other.
            print(f"[vk] {error}")
    return leads
