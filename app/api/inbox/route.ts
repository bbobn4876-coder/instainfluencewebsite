import { NextResponse } from "next/server";
import { fetchInbox } from "@/lib/inbox";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 25);
  const result = await fetchInbox(user.id, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25);
  return NextResponse.json(result);
}
