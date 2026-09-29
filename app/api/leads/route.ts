import { NextResponse } from "next/server";
import { LEAD_SOURCES, MODULES } from "@/lib/leads";
import { runLeadSearch, toLeadQuery } from "@/lib/leadSearch";
import { requireUser } from "@/lib/session";
import { allowance } from "@/lib/subscription";

export const dynamic = "force-dynamic";

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

  const query = toLeadQuery(await request.json().catch(() => ({})));
  if (query.sources.length === 0) {
    return NextResponse.json({ error: "Pick at least one source.", leads: [] }, { status: 400 });
  }

  return NextResponse.json(await runLeadSearch(user.id, query));
}
