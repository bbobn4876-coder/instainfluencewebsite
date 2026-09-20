import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

export type TokenPurpose = "verify" | "reset";

type StoredToken = {
  hash: string;
  userId: string;
  purpose: TokenPurpose;
  expiresAt: number;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

const TTL_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

async function readTokens(): Promise<StoredToken[]> {
  try {
    const all = JSON.parse(await fs.readFile(TOKENS_FILE, "utf8")) as StoredToken[];
    return all.filter((token) => token.expiresAt > Date.now());
  } catch {
    return [];
  }
}

async function writeTokens(tokens: StoredToken[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Returns the raw token; only its hash is stored. */
export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokens = await readTokens();
  // One live token per purpose and user keeps old links from piling up.
  const kept = tokens.filter((t) => !(t.userId === userId && t.purpose === purpose));
  await writeTokens([
    ...kept,
    { hash: hash(raw), userId, purpose, expiresAt: Date.now() + TTL_MS[purpose] },
  ]);
  return raw;
}

/** Consumes the token and returns the user it belongs to. */
export async function useToken(raw: string, purpose: TokenPurpose): Promise<string | null> {
  const tokens = await readTokens();
  const digest = hash(raw);
  const found = tokens.find((t) => t.hash === digest && t.purpose === purpose);
  if (!found) return null;
  await writeTokens(tokens.filter((t) => t.hash !== digest));
  return found.userId;
}
