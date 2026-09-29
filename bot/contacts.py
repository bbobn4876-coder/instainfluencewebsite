"""Pulling phones, emails and links out of free text.

A port of lib/contacts.ts, so a lead found by the bot carries exactly the same
contacts the web app would have found in the same text.
"""

from __future__ import annotations

import re

EMAIL_RE = re.compile(
    r"[a-z0-9._%+-]+\s?(?:@|\(at\)|\[at\]|\s+at\s+)\s?[a-z0-9.-]+\.[a-z]{2,}", re.I
)
PHONE_RE = re.compile(r"\+\d[\d\s().-]{7,17}\d")
URL_RE = re.compile(r"\b(?:https?://)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:/[^\s,;]*)?", re.I)

_PLATFORMS = [
    ("tiktok", re.compile(r"tiktok\.com", re.I)),
    ("youtube", re.compile(r"youtube\.com|youtu\.be", re.I)),
    ("twitter", re.compile(r"twitter\.com|x\.com", re.I)),
    ("telegram", re.compile(r"t\.me|telegram\.me", re.I)),
    ("whatsapp", re.compile(r"wa\.me|whatsapp\.com", re.I)),
    ("vk", re.compile(r"vk\.com", re.I)),
    ("instagram", re.compile(r"instagram\.com", re.I)),
    ("facebook", re.compile(r"facebook\.com|fb\.com", re.I)),
]

_NOT_A_DOMAIN = re.compile(r"\.(jpg|jpeg|png|gif|webp|mp4|pdf)$", re.I)


def _normalize_email(raw: str) -> str:
    cleaned = re.sub(r"\s*\(at\)\s*|\s*\[at\]\s*|\s+at\s+", "@", raw, flags=re.I)
    return re.sub(r"\s+", "", cleaned).lower()


def extract_emails(*sources: str | None) -> list[str]:
    found: list[str] = []
    for text in sources:
        if not text:
            continue
        for match in EMAIL_RE.findall(text):
            email = _normalize_email(match)
            if re.fullmatch(r"[^@]+@[^@]+\.[a-z]{2,}", email, re.I) and email not in found:
                found.append(email)
    return found


def extract_phones(*sources: str | None) -> list[str]:
    found: list[str] = []
    for text in sources:
        if not text:
            continue
        for match in PHONE_RE.findall(text):
            phone = re.sub(r"[\s().-]", "", match)
            if phone not in found:
                found.append(phone)
    return found


def detect_platform(url: str) -> str:
    for platform, test in _PLATFORMS:
        if test.search(url):
            return platform
    return "website"


def extract_links(*sources: str | None) -> list[dict[str, str]]:
    by_url: dict[str, dict[str, str]] = {}
    for text in sources:
        if not text:
            continue
        # Strip emails first, or their domains come back as links.
        without_emails = EMAIL_RE.sub(" ", text)
        for raw in URL_RE.findall(without_emails):
            cleaned = raw.rstrip(".,;)")
            if _NOT_A_DOMAIN.search(cleaned):
                continue
            url = cleaned if re.match(r"^https?://", cleaned, re.I) else f"https://{cleaned}"
            by_url.setdefault(url.lower(), {"platform": detect_platform(url), "url": url})
    return list(by_url.values())
