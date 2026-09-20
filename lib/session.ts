import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, userFromToken, type User } from "./auth";

/** Resolves the signed-in user for a route handler, or null. */
export async function currentUser(): Promise<User | null> {
  return userFromToken(cookies().get(SESSION_COOKIE)?.value);
}

/** Guard for every endpoint that touches a user's own data. */
export async function requireUser(): Promise<
  { user: User; response?: undefined } | { user?: undefined; response: NextResponse }
> {
  const user = await currentUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Sign in to use this feature." }, { status: 401 }),
    };
  }
  if (!user.emailVerified) {
    return {
      response: NextResponse.json(
        { error: "Confirm your email address first — check your inbox for the link.", needsVerification: true },
        { status: 403 },
      ),
    };
  }
  return { user };
}
