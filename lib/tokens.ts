import type { Influencer } from "./types";

export type TokenId = "name" | "username" | "followers" | "niche" | "city" | "country";

/**
 * Words the user types straight into the message. They are matched
 * case-sensitively in their canonical form, so "Name" is substituted while
 * "name" in an ordinary sentence is left alone.
 */
export const TOKENS: Array<{ id: TokenId; words: { en: string; ru: string } }> = [
  { id: "name", words: { en: "Name", ru: "Имя" } },
  { id: "username", words: { en: "Username", ru: "Юзернейм" } },
  { id: "followers", words: { en: "Followers", ru: "Подписчики" } },
  { id: "niche", words: { en: "Niche", ru: "Ниша" } },
  { id: "city", words: { en: "City", ru: "Город" } },
  { id: "country", words: { en: "Country", ru: "Страна" } },
];

/** Every spelling of every token, longest first so "Username" wins over "Name". */
export function tokenWords(): Array<{ id: TokenId; word: string }> {
  return TOKENS.flatMap((token) => [
    { id: token.id, word: token.words.en },
    { id: token.id, word: token.words.ru },
  ]).sort((a, b) => b.word.length - a.word.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One regex matching any token as a whole word, used for both render and highlight. */
export function tokenPattern(): RegExp {
  const words = tokenWords().map((t) => escapeRegExp(t.word));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${words.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

export function tokenIdFor(word: string): TokenId | undefined {
  return tokenWords().find((t) => t.word === word)?.id;
}

function valueFor(id: TokenId, influencer: Influencer): string {
  switch (id) {
    case "name":
      return influencer.fullName || influencer.username;
    case "username":
      return influencer.username;
    case "followers":
      return influencer.followers.toLocaleString("en-US");
    case "niche":
      return influencer.category;
    case "city":
      return influencer.city ?? influencer.country;
    case "country":
      return influencer.country;
  }
}

export function renderTemplate(template: string, influencer: Influencer): string {
  return template.replace(tokenPattern(), (match) => {
    const id = tokenIdFor(match);
    return id ? valueFor(id, influencer) : match;
  });
}
