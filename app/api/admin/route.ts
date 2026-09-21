import { NextResponse } from "next/server";
import { deleteUser, listUsers } from "@/lib/auth";
import { deleteSettings, readSettings } from "@/lib/settings";
import { REQUEST_COST, deleteSubscription, getSubscription, setConfig } from "@/lib/subscription";
import { limitsOf, normalizeConfig } from "@/lib/plans";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everything the panel shows: accounts, what each has connected, server integrations. */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const users = await listUsers();
  const accounts = await Promise.all(
    users.map(async (account) => {
      const settings = await readSettings(account.id);
      const subscription = await getSubscription(account.id);
      return {
        ...account,
        config: subscription.config,
        limits: subscription.config ? limitsOf(subscription.config) : null,
        usedToday: subscription.usedToday,
        totals: subscription.totals,
        spend: Number((subscription.totals.requests * REQUEST_COST).toFixed(2)),
        language: settings.language,
        smtp: settings.mailboxes.some((box) => box.host && box.user && box.pass),
        mailboxes: settings.mailboxes.filter((box) => box.host && box.user && box.pass).length,
        smtpFrom: settings.mailboxes[0]?.from || settings.mailboxes[0]?.user || "",
        imap: Boolean(settings.imap.host && settings.imap.pass),
        telegram: Boolean(settings.telegramBotToken),
        instagram: settings.accounts.instagram,
      };
    }),
  );

  return NextResponse.json({
    accounts,
    integrations: {
      hiker: Boolean(process.env.HIKER_TOKEN),
      requestCost: REQUEST_COST,
      apify: Boolean(process.env.APIFY_TOKEN),
      apifyActor: process.env.APIFY_ACTOR_ID ?? "apify~instagram-scraper",
      instagramGraph: Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID),
      authSecret: Boolean(process.env.AUTH_SECRET),
      dataDir: process.env.DATA_DIR ?? ".data",
      node: process.version,
    },
  });
}

/** Grants or clears a subscription on someone else's account. */
export async function PATCH(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as { userId?: string; config?: unknown };
  if (!body.userId) return NextResponse.json({ error: "No account given." }, { status: 400 });

  const config = body.config === null ? null : normalizeConfig(body.config);
  const subscription = await setConfig(body.userId, config);
  return NextResponse.json({
    userId: body.userId,
    config: subscription.config,
    limits: subscription.config ? limitsOf(subscription.config) : null,
  });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "No account given." }, { status: 400 });
  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const removed = await deleteUser(userId);
  if (!removed) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  await deleteSettings(userId);
  await deleteSubscription(userId);
  return NextResponse.json({ ok: true });
}
