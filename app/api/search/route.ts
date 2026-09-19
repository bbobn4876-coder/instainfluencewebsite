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

  const country = String(payload.country ?? "").toUpperCase();
  if (!countryByCode(country)) {
    return NextResponse.json({ error: "Unknown or missing country code." }, { status: 400 });
  }

  const query: SearchQuery = {
    country,
    category: payload.category ? String(payload.category) : undefined,
    keyword: payload.keyword ? String(payload.keyword) : undefined,
    minFollowers: Number.isFinite(payload.minFollowers) ? Number(payload.minFollowers) : undefined,
    maxFollowers: Number.isFinite(payload.maxFollowers) ? Number(payload.maxFollowers) : undefined,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : 24,
  };

  const result = await searchInfluencers(query);
  return NextResponse.json(result);
}
