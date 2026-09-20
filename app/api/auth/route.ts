import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  createUser,
  normalizeEmail,
  sessionCookieOptions,
  validateCredentials,
  verifyUser,
} from "@/lib/auth";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Who is signed in, if anyone. */
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}

/** action: "signup" | "signin" */
export async function POST(request: Request) {
  let payload: { action?: string; email?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = normalizeEmail(String(payload.email ?? ""));
  const password = String(payload.password ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (payload.action === "signup") {
    const created = await createUser(email, password);
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
    const response = NextResponse.json({ user: created });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(created.id), sessionCookieOptions);
    return response;
  }

  const user = await verifyUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
  return response;
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ user: null });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
