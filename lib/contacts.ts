import type { SocialLink } from "./types";

const EMAIL_RE = /[a-z0-9._%+-]+\s?(?:@|\(at\)|\[at\]|\s+at\s+)\s?[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\+\d[\d\s().-]{7,17}\d/g;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;]*)?/gi;

const PLATFORMS: Array<{ platform: string; test: RegExp }> = [
  { platform: "tiktok", test: /tiktok\.com/i },
  { platform: "youtube", test: /(youtube\.com|youtu\.be)/i },
  { platform: "twitter", test: /(twitter\.com|x\.com)/i },
  { platform: "telegram", test: /(t\.me|telegram\.me)/i },
  { platform: "whatsapp", test: /(wa\.me|whatsapp\.com)/i },
  { platform: "linkedin", test: /linkedin\.com/i },
  { platform: "facebook", test: /(facebook\.com|fb\.com)/i },
  { platform: "twitch", test: /twitch\.tv/i },
  { platform: "snapchat", test: /snapchat\.com/i },
  { platform: "pinterest", test: /pinterest\./i },
  { platform: "onlyfans", test: /onlyfans\.com/i },
  { platform: "patreon", test: /patreon\.com/i },
  { platform: "linktree", test: /(linktr\.ee|beacons\.ai|lnk\.bio|taplink|linkin\.bio)/i },
];

const NOT_A_DOMAIN = /\.(jpg|jpeg|png|gif|webp|mp4|pdf)$/i;

function normalizeEmail(raw: string): string {
  return raw
    .replace(/\s*\(at\)\s*|\s*\[at\]\s*|\s+at\s+/gi, "@")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function extractEmails(...sources: (string | undefined | null)[]): string[] {
  const found = new Set<string>();
  for (const text of sources) {
    if (!text) continue;
    for (const match of text.match(EMAIL_RE) ?? []) {
      const email = normalizeEmail(match);
      if (/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(email)) found.add(email);
    }
  }
  return [...found];
}

export function extractPhones(...sources: (string | undefined | null)[]): string[] {
  const found = new Set<string>();
  for (const text of sources) {
    if (!text) continue;
    for (const match of text.match(PHONE_RE) ?? []) {
      found.add(match.replace(/[\s().-]/g, ""));
    }
  }
  return [...found];
}

export function detectPlatform(url: string): string {
  const hit = PLATFORMS.find((p) => p.test.test(url));
  if (hit) return hit.platform;
  if (/instagram\.com/i.test(url)) return "instagram";
  return "website";
}

export function extractLinks(...sources: (string | undefined | null)[]): SocialLink[] {
  const byUrl = new Map<string, SocialLink>();
  for (const text of sources) {
    if (!text) continue;
    // Strip emails first so their domains are not picked up as links.
    const withoutEmails = text.replace(EMAIL_RE, " ");
    for (const raw of withoutEmails.match(URL_RE) ?? []) {
      const cleaned = raw.replace(/[.,;)]+$/, "");
      if (NOT_A_DOMAIN.test(cleaned)) continue;
      const url = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
      const key = url.toLowerCase();
      if (!byUrl.has(key)) byUrl.set(key, { platform: detectPlatform(url), url });
    }
  }
  return [...byUrl.values()];
}
