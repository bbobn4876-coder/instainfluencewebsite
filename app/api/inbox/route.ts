import { NextResponse } from "next/server";
import { fetchInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 25);
  const result = await fetchInbox(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25);
  return NextResponse.json(result);
}
