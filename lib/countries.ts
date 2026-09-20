export type Country = { code: string; name: string; flag: string; cities: string[] };

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", flag: "🇺🇸", cities: ["Los Angeles", "New York", "Miami", "Austin"] },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", cities: ["London", "Manchester", "Bristol"] },
  { code: "DE", name: "Germany", flag: "🇩🇪", cities: ["Berlin", "Munich", "Hamburg"] },
  { code: "FR", name: "France", flag: "🇫🇷", cities: ["Paris", "Lyon", "Marseille"] },
  { code: "ES", name: "Spain", flag: "🇪🇸", cities: ["Madrid", "Barcelona", "Valencia"] },
  { code: "IT", name: "Italy", flag: "🇮🇹", cities: ["Milan", "Rome", "Naples"] },
  { code: "PL", name: "Poland", flag: "🇵🇱", cities: ["Warsaw", "Krakow", "Gdansk"] },
  { code: "UA", name: "Ukraine", flag: "🇺🇦", cities: ["Kyiv", "Lviv", "Odesa"] },
  { code: "TR", name: "Turkey", flag: "🇹🇷", cities: ["Istanbul", "Ankara", "Izmir"] },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", cities: ["Dubai", "Abu Dhabi"] },
  { code: "BR", name: "Brazil", flag: "🇧🇷", cities: ["Sao Paulo", "Rio de Janeiro"] },
  { code: "MX", name: "Mexico", flag: "🇲🇽", cities: ["Mexico City", "Guadalajara"] },
  { code: "IN", name: "India", flag: "🇮🇳", cities: ["Mumbai", "Delhi", "Bangalore"] },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", cities: ["Jakarta", "Bali"] },
  { code: "JP", name: "Japan", flag: "🇯🇵", cities: ["Tokyo", "Osaka"] },
  { code: "KR", name: "South Korea", flag: "🇰🇷", cities: ["Seoul", "Busan"] },
  { code: "AU", name: "Australia", flag: "🇦🇺", cities: ["Sydney", "Melbourne"] },
  { code: "CA", name: "Canada", flag: "🇨🇦", cities: ["Toronto", "Vancouver"] },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", cities: ["Amsterdam", "Rotterdam"] },
  { code: "SE", name: "Sweden", flag: "🇸🇪", cities: ["Stockholm", "Gothenburg"] },
];

export const CATEGORIES = [
  "fashion",
  "beauty",
  "fitness",
  "travel",
  "food",
  "tech",
  "gaming",
  "gambling",
  "betting",
  "crypto",
  "trading",
  "finance",
  "motivation",
  "selfdevelopment",
  "business",
  "marketing",
  "music",
  "dance",
  "art",
  "photography",
  "auto",
  "sport",
  "health",
  "parenting",
  "pets",
  "education",
  "comedy",
  "lifestyle",
];

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}
