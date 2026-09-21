import { NextResponse } from "next/server";
import { activeProvider, pollApifyRun, searchInfluencers, startApifyRun } from "@/lib/providers";
import type { CrawlStats } from "@/lib/crawl";
import { stepHikerCrawl } from "@/lib/hikerCrawl";
import { ALL, countryByCode } from "@/lib/countries";
import { requireUser } from "@/lib/session";
import type { SearchQuery } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let payload: Partial<SearchQuery> & {
    runId?: string;
    datasetId?: string;
    stage?: string;
    geo?: unknown;
    seen?: unknown;
    cursor?: unknown;
    stats?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requested = [...new Set((Array.isArray(payload.countries) ? payload.countries : []).map(
    (c) => String(c).toUpperCase(),
  ))];
  const countries = requested.includes(ALL)
    ? [ALL]
    : requested.filter((code) => countryByCode(code));
  if (countries.length === 0) {
    return NextResponse.json({ error: "Pick at least one known country." }, { status: 400 });
  }

  const requestedCategories = [...new Set(
    (Array.isArray(payload.categories) ? payload.categories : []).map((c) => String(c)),
  )];
  const categories = requestedCategories.includes(ALL) ? [ALL] : requestedCategories;

  const query: SearchQuery = {
    countries,
    categories: categories.length > 0 ? categories : undefined,
    keyword: payload.keyword ? String(payload.keyword) : undefined,
    minFollowers: Number.isFinite(payload.minFollowers) ? Number(payload.minFollowers) : undefined,
    maxFollowers: Number.isFinite(payload.maxFollowers) ? Number(payload.maxFollowers) : undefined,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : 24,
  };

  // HikerAPI answers per request, so a round of work happens right here and
  // the client calls back for the next one.
  if (activeProvider() === "hiker") {
    const run =
      payload.stage === "details"
        ? {
            stage: "details" as const,
            seen: Array.isArray(payload.seen) ? payload.seen.map(String) : [],
            cursor: Number.isFinite(payload.cursor) ? Number(payload.cursor) : 0,
            geo: (payload.geo ?? {}) as Record<string, { code: string; place: string }>,
            stats: (payload.stats ?? undefined) as CrawlStats | undefined,
          }
        : null;
    try {
      const state = await stepHikerCrawl(run, query);
      if (state.status === "failed") {
        const fallback = await searchInfluencers(query);
        return NextResponse.json({ ...fallback, status: "done", notice: state.detail });
      }
      if (state.status === "running") {
        return NextResponse.json({
          provider: "hiker",
          status: "running",
          ...state.run,
          influencers: state.influencers ?? [],
          scanned: state.scanned,
        });
      }
      return NextResponse.json({
        provider: "hiker",
        status: "done",
        influencers: state.influencers,
        scanned: state.scanned,
        matched: state.matched,
        confirmed: state.confirmed,
        stats: state.stats,
      });
    } catch (error) {
      const fallback = await searchInfluencers(query);
      return NextResponse.json({
        ...fallback,
        status: "done",
        notice: `${(error as Error).message} Sample data is shown below in the meantime.`,
      });
    }
  }

  // Apify runs for a minute or more, far past any serverless time limit, so the
  // request only starts it and hands the client a run to poll.
  if (activeProvider() === "apify") {
    const run =
      typeof payload.runId === "string" && typeof payload.datasetId === "string"
        ? {
            runId: payload.runId,
            datasetId: payload.datasetId,
            stage: payload.stage === "details" ? ("details" as const) : ("discover" as const),
            geo: (payload.geo ?? {}) as Record<string, { code: string; place: string }>,
            seen: Array.isArray(payload.seen) ? payload.seen.map(String) : [],
            cursor: Number.isFinite(payload.cursor) ? Number(payload.cursor) : 0,
            stats: (payload.stats ?? undefined) as CrawlStats | undefined,
          }
        : null;

    try {
      if (!run) {
        const started = await startApifyRun(query);
        return NextResponse.json({ provider: "apify", status: "running", ...started });
      }

      const state = await pollApifyRun(run, query);
      if (state.status === "running") {
        // The run may have moved from collecting candidates to reading profiles,
        // and each profile round hands back the creators it already found.
        return NextResponse.json({
          provider: "apify",
          status: "running",
          ...state.run,
          influencers: state.influencers ?? [],
        });
      }
      if (state.status === "failed") {
        const fallback = await searchInfluencers(query);
        return NextResponse.json({ ...fallback, status: "done", notice: state.detail });
      }
      return NextResponse.json({
        provider: "apify",
        status: "done",
        influencers: state.influencers,
        scanned: state.scanned,
        matched: state.matched,
        confirmed: state.confirmed,
        stats: state.stats,
      });
    } catch (error) {
      // A broken token or a network problem should not leave the page empty.
      const fallback = await searchInfluencers(query);
      return NextResponse.json({
        ...fallback,
        status: "done",
        notice: `${(error as Error).message} Sample data is shown below in the meantime.`,
      });
    }
  }

  const result = await searchInfluencers(query);
  return NextResponse.json({ ...result, status: "done" });
}
