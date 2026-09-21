import { NextResponse } from "next/server";
import { hashtagPage, profile, suggestedProfiles } from "@/lib/hiker";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

type Probe = { name: string; ok: boolean; detail: string };

/**
 * Calls each endpoint the crawl depends on and reports what came back, so the
 * source can be verified from the panel instead of a terminal.
 */
export async function POST() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  if (!process.env.HIKER_TOKEN) {
    return NextResponse.json({ source: "hiker", configured: false, probes: [] as Probe[] });
  }

  const probes: Probe[] = [];
  let seedId: string | undefined;

  try {
    const page = await hashtagPage("losangeles");
    probes.push({
      name: "hashtag posts",
      ok: page.posts.length > 0,
      detail:
        page.posts.length > 0
          ? `${page.posts.length} posts, ${page.posts.filter((p) => p.location).length} with a location`
          : "answered, but no posts were recognised in the response",
    });
  } catch (error) {
    probes.push({ name: "hashtag posts", ok: false, detail: (error as Error).message });
  }

  try {
    const found = await profile("instagram");
    seedId = found?.id;
    probes.push({
      name: "profile",
      ok: Boolean(found && found.followers > 0),
      detail: found
        ? `@${found.username}, ${found.followers.toLocaleString("en-US")} followers`
        : "answered, but no profile was recognised in the response",
    });
  } catch (error) {
    probes.push({ name: "profile", ok: false, detail: (error as Error).message });
  }

  if (seedId) {
    try {
      const names = await suggestedProfiles(seedId);
      probes.push({
        name: "suggested profiles",
        ok: names.length > 0,
        detail:
          names.length > 0
            ? `${names.length} accounts, e.g. @${names[0]}`
            : "answered, but no accounts were recognised — the crawl will not snowball",
      });
    } catch (error) {
      probes.push({ name: "suggested profiles", ok: false, detail: (error as Error).message });
    }
  }

  return NextResponse.json({ source: "hiker", configured: true, probes });
}
