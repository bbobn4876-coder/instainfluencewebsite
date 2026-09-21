import { NextResponse } from "next/server";
import { fileName, toWorkbook } from "@/lib/exportTable";
import { requireUser } from "@/lib/session";
import { allowance } from "@/lib/subscription";
import type { Influencer } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Builds the styled spreadsheet server-side and streams it back. */
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

  const payload = (await request.json().catch(() => ({}))) as { influencers?: Influencer[] };
  const influencers = Array.isArray(payload.influencers) ? payload.influencers : [];
  if (influencers.length === 0) {
    return NextResponse.json({ error: "Select at least one account." }, { status: 400 });
  }

  const file = await toWorkbook(influencers);
  return new NextResponse(file, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName(influencers.length)}"`,
    },
  });
}
