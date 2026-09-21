/**
 * Calls each HikerAPI endpoint the crawl uses and reports what came back, so a
 * wrong field name shows up here instead of as an empty search.
 *
 *   HIKER_TOKEN=... npm run check-hiker
 */
const HOST = process.env.HIKER_HOST ?? "https://api.hikerapi.com";
const token = process.env.HIKER_TOKEN;

if (!token) {
  console.error("HIKER_TOKEN is not set. Put it in .env.local or pass it inline.");
  process.exit(1);
}

async function call(path, params) {
  const url = new URL(path, HOST);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { accept: "application/json", "x-access-key": token } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body };
}

const keys = (value, depth = 0) => {
  if (Array.isArray(value)) return `array(${value.length})` + (value.length ? ` of ${keys(value[0], depth + 1)}` : "");
  if (value && typeof value === "object") {
    const names = Object.keys(value);
    if (depth > 1) return `{${names.slice(0, 8).join(", ")}}`;
    return `{${names.slice(0, 14).join(", ")}}`;
  }
  return typeof value;
};

const checks = [
  ["hashtag posts", "/v2/hashtag/medias/recent", { name: "losangeles" }],
  ["profile", "/v1/user/by/username", { username: "instagram" }],
];

let userId;
for (const [label, path, params] of checks) {
  const { status, body } = await call(path, params);
  console.log(`\n== ${label} — ${path} — HTTP ${status}`);
  console.log("   top level:", keys(body));
  if (status === 200 && path.includes("user/by")) {
    const user = body?.user ?? body?.response ?? body;
    userId = user?.pk ?? user?.pk_id ?? user?.id;
    console.log("   user keys:", keys(user));
    console.log("   followers:", user?.follower_count ?? user?.followers_count ?? "NOT FOUND");
  }
  if (status === 200 && path.includes("hashtag")) {
    const list = body?.response?.sections ?? body?.sections ?? body?.medias ?? body?.items ?? body;
    console.log("   medias:", keys(list));
  }
  if (status !== 200) console.log("   body:", JSON.stringify(body).slice(0, 300));
}

if (userId) {
  const { status, body } = await call("/v2/user/suggested/profiles", { user_id: String(userId) });
  console.log(`\n== suggested profiles — /v2/user/suggested/profiles — HTTP ${status}`);
  console.log("   top level:", keys(body));
  if (status !== 200) console.log("   body:", JSON.stringify(body).slice(0, 300));
}

console.log("\nIf a section shows HTTP 200 but no recognisable keys, paste this output back.");
