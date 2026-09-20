import { NextResponse } from "next/server";
import { searchInfluencers } from "@/lib/providers";
import { countryByCode } from "@/lib/countries";
import type { SearchQuery } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: Partial<SearchQuery>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requested = Array.isArray(payload.countries) ? payload.countries : [];
  const countries = [...new Set(requested.map((c) => String(c).toUpperCase()))].filter((code) =>
    countryByCode(code),
  );
  if (countries.length === 0) {
    return NextResponse.json({ error: "Pick at least one known country." }, { status: 400 });
  }

  const categories = Array.isArray(payload.categories)
    ? [...new Set(payload.categories.map((c) => String(c)))]
    : [];

  const query: SearchQuery = {
    countries,
    categories: categories.length > 0 ? categories : undefined,
    keyword: payload.keyword ? String(payload.keyword) : undefined,
    minFollowers: Number.isFinite(payload.minFollowers) ? Number(payload.minFollowers) : undefined,
    maxFollowers: Number.isFinite(payload.maxFollowers) ? Number(payload.maxFollowers) : undefined,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : 24,
  };

  const result = await searchInfluencers(query);
  return NextResponse.json(result);
}
