import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  createUser,
  markVerified,
  normalizeEmail,
  sessionCookieOptions,
  setPassword,
  userByEmail,
  validateCredentials,
  verifyUser,
} from "@/lib/auth";
import { issueToken, useToken } from "@/lib/authTokens";
import { currentUser } from "@/lib/session";
import { appUrl, sendSystemMail } from "@/lib/systemMail";

export const dynamic = "force-dynamic";

/** Who is signed in, if anyone. */
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}

async function sendVerification(request: Request, userId: string, email: string) {
  const token = await issueToken(userId, "verify");
  const link = `${appUrl(request)}/?verify=${token}`;
  return sendSystemMail(
    email,
    "Confirm your Loomera address",
    `Confirm your email address to start using Loomera:\n\n${link}\n\nThe link is valid for 24 hours.`,
    link,
  );
}

/** action: "signup" | "signin" | "verify" | "resend" | "forgot" | "reset" */
export async function POST(request: Request) {
  let payload: { action?: string; email?: string; password?: string; token?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = normalizeEmail(String(payload.email ?? ""));
  const password = String(payload.password ?? "");
  const action = String(payload.action ?? "signin");

  // Confirming an address: the token stands in for the credentials.
  if (action === "verify") {
    const userId = await useToken(String(payload.token ?? ""), "verify");
    if (!userId) {
      return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
    }
    const user = await markVerified(userId);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
    return response;
  }

  if (action === "resend") {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (user.emailVerified) return NextResponse.json({ user });
    const delivery = await sendVerification(request, user.id, user.email);
    return NextResponse.json({ ok: true, ...delivery });
  }

  // Asking for a reset always answers the same way, so the endpoint cannot be
  // used to find out which addresses have an account.
  if (action === "forgot") {
    const user = await userByEmail(email);
    let delivery: { sent: boolean; detail: string; link?: string } = {
      sent: false,
      detail: "No account for this address.",
    };
    if (user) {
      const token = await issueToken(user.id, "reset");
      const link = `${appUrl(request)}/?reset=${token}`;
      delivery = await sendSystemMail(
        user.email,
        "Reset your Loomera password",
        `Choose a new password:\n\n${link}\n\nThe link is valid for one hour. Ignore this message if you did not ask for it.`,
        link,
      );
    }
    return NextResponse.json({ ok: true, sent: delivery.sent, link: delivery.link });
  }

  if (action === "reset") {
    if (password.length < 8) {
      return NextResponse.json({ error: "The password needs at least 8 characters." }, { status: 400 });
    }
    const userId = await useToken(String(payload.token ?? ""), "reset");
    if (!userId) {
      return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
    }
    await setPassword(userId, password);
    const response = NextResponse.json({ user: await markVerified(userId) });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(userId), sessionCookieOptions);
    return response;
  }

  const invalid = validateCredentials(email, password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (action === "signup") {
    const created = await createUser(email, password);
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
    const delivery = await sendVerification(request, created.id, created.email);
    const response = NextResponse.json({ user: created, verificationLink: delivery.link });
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
