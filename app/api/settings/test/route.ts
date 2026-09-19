import { NextResponse } from "next/server";
import { verifyEmailAccount } from "@/lib/outreach";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await verifyEmailAccount();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
