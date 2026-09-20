import { COUNTRIES, countryByCode } from "./countries";

/**
 * Extra spellings that show up in Instagram location names but are not in the
 * country list: alternative country names and a few large cities per country,
 * so a post tagged "Chicago, Illinois" is still recognised as the US.
 */
const EXTRA: Record<string, string[]> = {
  US: ["usa", "u.s.", "united states of america", "america", "chicago", "houston", "san francisco", "seattle", "boston", "atlanta", "dallas", "phoenix", "denver", "las vegas", "san diego", "philadelphia", "california", "texas", "florida", "new jersey", "illinois", "nevada", "arizona", "georgia", "washington"],
  GB: ["uk", "u.k.", "united kingdom", "england", "scotland", "wales", "birmingham", "leeds", "liverpool", "glasgow", "edinburgh"],
  DE: ["deutschland", "cologne", "köln", "frankfurt", "stuttgart", "düsseldorf", "dusseldorf"],
  FR: ["france", "nice", "toulouse", "bordeaux", "nantes"],
  ES: ["españa", "espana", "seville", "sevilla", "malaga", "málaga", "bilbao", "ibiza"],
  IT: ["italia", "turin", "torino", "florence", "firenze", "venice", "venezia", "bologna"],
  PL: ["polska", "wroclaw", "wrocław", "poznan", "poznań", "lodz", "łódź"],
  UA: ["ukraine", "україна", "kharkiv", "dnipro"],
  TR: ["türkiye", "turkiye", "antalya", "bursa"],
  AE: ["uae", "dubai marina", "sharjah"],
  BR: ["brasil", "brasilia", "belo horizonte", "curitiba", "salvador"],
  MX: ["méxico", "mexico", "monterrey", "cancun", "cancún", "puebla"],
  IN: ["bengaluru", "hyderabad", "chennai", "kolkata", "pune"],
  ID: ["bandung", "surabaya", "denpasar", "canggu", "seminyak"],
  JP: ["nippon", "kyoto", "yokohama", "nagoya", "fukuoka"],
  KR: ["korea", "incheon", "daegu", "jeju"],
  AU: ["brisbane", "perth", "adelaide", "gold coast"],
  CA: ["montreal", "montréal", "calgary", "ottawa", "edmonton"],
  NL: ["holland", "netherlands", "the hague", "den haag", "utrecht", "eindhoven"],
  SE: ["sverige", "malmo", "malmö", "uppsala"],
  EE: ["eesti", "narva", "parnu", "pärnu"],
  LV: ["latvija", "liepaja", "liepāja"],
  LT: ["lietuva", "klaipeda", "klaipėda", "siauliai"],
  NO: ["norge", "trondheim", "stavanger", "tromso", "tromsø"],
  DK: ["danmark", "odense", "aalborg"],
  IS: ["island", "reykjavík"],
  BE: ["belgie", "belgië", "belgique", "bruxelles", "brugge", "bruges", "liege", "liège"],
  LU: ["luxemburg"],
  HU: ["magyarorszag", "magyarország", "szeged", "pecs", "pécs"],
  SK: ["slovensko", "košice", "zilina", "žilina"],
  RO: ["romania", "românia", "iasi", "iași", "constanta", "constanța", "brasov", "brașov"],
  BG: ["bulgaria", "българия", "burgas", "ruse"],
  GR: ["hellas", "ελλάδα", "patras", "heraklion", "mykonos", "santorini", "crete"],
  HR: ["hrvatska", "rijeka", "zadar", "hvar"],
  BA: ["bosna", "bosnia", "herzegovina", "mostar", "tuzla"],
  ME: ["crna gora", "kotor", "tivat", "herceg novi"],
  AL: ["shqiperia", "shqipëria", "vlore", "vlorë", "sarande", "sarandë"],
};

function needles(code: string): string[] {
  const country = countryByCode(code);
  if (!country) return [];
  return [
    country.name.toLowerCase(),
    ...country.cities.map((city) => city.toLowerCase()),
    ...(EXTRA[code] ?? []),
  ];
}

/** Which of the known countries a location name belongs to, if any. */
export function countryOfLocation(location: string | undefined): string | null {
  if (!location) return null;
  const text = location.toLowerCase();
  for (const country of COUNTRIES) {
    for (const needle of needles(country.code)) {
      // Word-ish boundary so "Nice" does not match inside "Venice".
      const pattern = new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
      if (pattern.test(text)) return country.code;
    }
  }
  return null;
}

export type GeoVerdict = "match" | "other" | "unknown";

/** Whether a post's location fits the requested geo. */
export function verdictFor(location: string | undefined, wanted: string[]): GeoVerdict {
  const code = countryOfLocation(location);
  if (!code) return "unknown";
  return wanted.includes(code) ? "match" : "other";
}
