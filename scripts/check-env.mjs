/**
 * Prints which integrations the app will use, without ever printing a secret.
 * Run with: npm run check-env
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const files = [".env.local", ".env"];
const env = {};

let loaded = null;
for (const name of files) {
  const file = path.join(root, name);
  if (!existsSync(file)) continue;
  loaded = name;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    // Strip surrounding quotes the way dotenv does.
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const mask = (value) =>
  value.length <= 8 ? "set" : `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;

const line = (ok, label, detail) =>
  console.log(`${ok ? "  ok " : "  -- "}${label.padEnd(30)}${detail}`);

console.log("");
if (!loaded) {
  console.log("No .env.local or .env found in", root);
  console.log("Create one with:  cp .env.example .env.local\n");
  process.exit(1);
}
console.log(`Reading ${loaded}\n`);

const apify = env.APIFY_TOKEN ?? "";
const igToken = env.IG_ACCESS_TOKEN ?? "";
const igAccount = env.IG_BUSINESS_ACCOUNT_ID ?? "";
const secret = env.AUTH_SECRET ?? "";

console.log("Profile source");
if (apify) {
  line(true, "Apify", mask(apify));
  line(true, "actor", env.APIFY_ACTOR_ID || "apify~instagram-scraper (default)");
  if (!apify.startsWith("apify_api_")) {
    line(false, "warning", "an Apify token usually starts with apify_api_");
  }
} else if (igToken && igAccount) {
  line(true, "Instagram Graph", "handle lookup only, no geo search");
} else {
  line(false, "none", "the app will serve generated sample data");
}

console.log("\nStorage");
const db = env.DATABASE_URL ?? "";
if (db) {
  const host = db.match(/@([^/?]+)/)?.[1] ?? "unknown host";
  line(true, "Postgres", host);
  if (!/^postgres(ql)?:\/\//.test(db)) {
    line(false, "warning", "the URL should start with postgresql://");
  }
} else {
  line(false, "files in .data", "fine on a server with a disk, breaks on serverless hosts");
}

console.log("\nAdmin");
if (env.ADMIN_PASSWORD) {
  line(true, env.ADMIN_EMAIL || "loomeracompany@gmail.com", `password ${mask(env.ADMIN_PASSWORD)}`);
} else {
  line(false, "ADMIN_PASSWORD", "not set — no admin account is created");
}

console.log("\nSessions");
if (!secret) {
  line(false, "AUTH_SECRET", "not set — a key is generated into .data/secret");
} else if (secret.length < 32) {
  line(false, "AUTH_SECRET", `too short (${secret.length}); use: openssl rand -hex 32`);
} else {
  line(true, "AUTH_SECRET", `${secret.length} chars`);
}

const stale = ["SYSTEM_SMTP_HOST", "SYSTEM_SMTP_USER", "SYSTEM_MAIL_FROM", "APP_URL"].filter(
  (key) => env[key],
);
if (stale.length) {
  console.log("\nNo longer used (safe to delete)");
  for (const key of stale) line(false, key, "confirmation mail was removed");
}

console.log("\nMail for outreach is connected per account in Settings, not here.\n");
