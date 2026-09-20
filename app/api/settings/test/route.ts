import { NextResponse } from "next/server";
import { verifyEmailAccount } from "@/lib/outreach";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const result = await verifyEmailAccount(user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
