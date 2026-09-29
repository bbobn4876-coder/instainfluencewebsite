"""Local businesses on Instagram, through HikerAPI — a provider that is allowed
to answer.

Duplicate accounts, rotated session cookies and proxies would be circumvention,
and they are what loses the accounts doing it. This asks instead.

Every profile read is a billed request, so LEADS_IG_PROFILES is the cost knob.
"""

from __future__ import annotations

import re

from config import HIKER_TOKEN, IG_PROFILE_BUDGET
from contacts import extract_emails, extract_links, extract_phones
from leads import CATEGORY_TERMS, Lead, Query
from web import HttpError, get_json

HOST = "https://api.hikerapi.com"


def _get(path: str, params: dict[str, object]) -> object:
    try:
        return get_json(f"{HOST}{path}", params, headers={"x-access-key": HIKER_TOKEN})
    except HttpError as error:
        # The server's own wording, always: a guessed explanation of a status
        # code sends you looking in the wrong place.
        if error.status in (401, 403):
            raise RuntimeError(f"HikerAPI отклонил токен ({error.status}). {error.body[:150]}") from None
        if error.status == 402:
            raise RuntimeError(f"На балансе HikerAPI нет средств. {error.body[:150]}") from None
        raise RuntimeError(f"HikerAPI {error.status}. {error.body[:150]}") from None


def _clean_tag(value: str) -> str:
    return re.sub(r"[^a-zа-я0-9]", "", value.lower())


def _tags(query: Query) -> list[str]:
    """City plus trade is what a local business actually tags itself with."""
    city = _clean_tag(query.city)
    tags: list[str] = []
    base_terms = [CATEGORY_TERMS.get(query.category, query.category), *query.keywords]

    for term in base_terms:
        for word in term.split():
            tag = _clean_tag(word)
            if not tag or len(tag) < 3:
                continue
            for candidate in (tag, f"{city}{tag}" if city else ""):
                if candidate and candidate not in tags:
                    tags.append(candidate)
    return tags[:6]


def _walk_usernames(node: object, found: list[str]) -> None:
    """HikerAPI wraps each endpoint's answer differently and the shape moves
    between versions. Rather than guess the path, walk the whole payload and
    take every author it mentions."""
    if isinstance(node, dict):
        name = node.get("username")
        if isinstance(name, str) and name and name not in found:
            found.append(name)
        for value in node.values():
            _walk_usernames(value, found)
    elif isinstance(node, list):
        for value in node:
            _walk_usernames(value, found)


def _usernames(tag: str) -> list[str]:
    found: list[str] = []
    _walk_usernames(_get("/v2/hashtag/medias/recent", {"name": tag}), found)
    return found


def _profile(username: str) -> dict | None:
    body = _get("/v1/user/by/username", {"username": username})
    user = body.get("user") if isinstance(body, dict) and "user" in body else body
    return user if isinstance(user, dict) and user.get("username") else None


def _to_lead(user: dict, query: Query) -> Lead | None:
    followers = int(user.get("follower_count") or user.get("followers") or 0)
    # Below this it is a personal page; above it they have an agency already.
    if followers < 300 or followers > 120_000:
        return None

    bio = user.get("biography") or ""
    signals: list[str] = []
    if not user.get("media_count"):
        signals.append("stale")
    if followers >= 2000:
        signals.append("highRating")
    if not signals:
        return None

    username = user["username"]
    return Lead(
        id=f"instagram:{user.get('pk') or username}",
        source="instagram",
        name=user.get("full_name") or f"@{username}",
        context=" ".join(bio.split())[:300],
        url=f"https://instagram.com/{username}",
        city=query.city,
        category=user.get("category") or query.category,
        phones=extract_phones(bio, user.get("public_phone_number")),
        emails=extract_emails(bio, user.get("public_email")),
        links=extract_links(bio, user.get("external_url")),
        signals=signals,
    )


def find(query: Query) -> list[Lead]:
    if not HIKER_TOKEN:
        return []

    usernames: list[str] = []
    for tag in _tags(query):
        if len(usernames) >= IG_PROFILE_BUDGET:
            break
        try:
            for name in _usernames(tag):
                if name not in usernames:
                    usernames.append(name)
                if len(usernames) >= IG_PROFILE_BUDGET:
                    break
        except Exception as error:
            # A dead tag must not sink the run; the others still answer.
            print(f"[instagram] #{tag}: {error}")

    leads: list[Lead] = []
    for username in usernames:
        if len(leads) >= query.limit:
            break
        try:
            user = _profile(username)
        except Exception as error:
            print(f"[instagram] @{username}: {error}")
            continue
        lead = _to_lead(user, query) if user else None
        if lead:
            leads.append(lead)
    return leads
