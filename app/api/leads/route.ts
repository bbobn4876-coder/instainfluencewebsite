import { NextResponse } from "next/server";
import {
  DEFAULT_STOP_WORDS,
  LEAD_SOURCES,
  MODULES,
  cleanLeads,
  type Lead,
  type LeadQuery,
  type LeadSource,
} from "@/lib/leads";
import { instagramLeads } from "@/lib/leadSources/instagram";
import { mapsLeads } from "@/lib/leadSources/maps";
import { sampleLeads } from "@/lib/leadSources/sample";
import { telegramLeads } from "@/lib/leadSources/telegram";
import { vkLeads } from "@/lib/leadSources/vk";
import { requireUser } from "@/lib/session";
import { allowance, bumpTotal } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const RUNNERS: Partial<Record<LeadSource, (query: LeadQuery) => Promise<Lead[]>>> = {
  vk: vkLeads,
  telegram: telegramLeads,
  maps: mapsLeads,
  instagram: instagramLeads,
};

/** Which modules can run right now, and why the others cannot. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({
    modules: LEAD_SOURCES.map((id) => {
      const info = MODULES[id];
      return {
        id,
        unavailable: info.unavailable ?? null,
        configured: info.envKey ? Boolean(process.env[info.envKey]) : false,
        envKey: info.envKey ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const quota = await allowance(user.id, user.isAdmin);
  if (!quota.limits) {
    return NextResponse.json(
      { error: "Pick a plan to use this.", reason: "no-plan" },
      { status: 402 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as Partial<LeadQuery>;
  const asked = Array.isArray(payload.sources) ? payload.sources : [];
  const sources = LEAD_SOURCES.filter((id) => asked.includes(id) && !MODULES[id].unavailable);

  const query: LeadQuery = {
    sources,
    city: typeof payload.city === "string" ? payload.city.trim() : "",
    categories: Array.isArray(payload.categories) ? payload.categories.map(String) : [],
    keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String).filter(Boolean) : [],
    stopWords: Array.isArray(payload.stopWords) ? payload.stopWords.map(String) : DEFAULT_STOP_WORDS,
    limit: Number.isFinite(payload.limit) ? Math.min(200, Number(payload.limit)) : 60,
  };

  if (query.sources.length === 0) {
    return NextResponse.json({ error: "Pick at least one source.", leads: [] }, { status: 400 });
  }

  // Every module that is configured runs; the rest are reported, not guessed at.
  const live = query.sources.filter((id) => {
    const key = MODULES[id].envKey;
    return key ? Boolean(process.env[key]) : false;
  });

  const notes: string[] = [];
  let leads: Lead[] = [];

  if (live.length === 0) {
    leads = sampleLeads(query);
    notes.push("sample");
  } else {
    const runs = await Promise.all(
      live.map(async (id) => {
        try {
          return await (RUNNERS[id]?.(query) ?? Promise.resolve([]));
        } catch (error) {
          notes.push(`${id}: ${(error as Error).message}`);
          return [];
        }
      }),
    );
    leads = runs.flat();
  }

  const cleaned = cleanLeads(leads, query.stopWords).slice(0, query.limit);
  await bumpTotal(user.id, "searches");

  return NextResponse.json({
    leads: cleaned,
    ran: live,
    skipped: query.sources.filter((id) => !live.includes(id)),
    notes,
  });
}
