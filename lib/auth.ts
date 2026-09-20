import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import { databaseConfigured, query } from "./db";

export type User = { id: string; email: string; createdAt: string; isAdmin: boolean };

/** The one account that may open the admin panel. */
export const ADMIN_EMAIL = normalizeEmail(
  process.env.ADMIN_EMAIL ?? "loomeracompany@gmail.com",
);
type StoredUser = Omit<User, "isAdmin"> & { salt: string; hash: string };

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "secret");

export const SESSION_COOKIE = "loomera_session";
const SESSION_DAYS = 30;

type UserRow = { id: string; email: string; created_at: Date; salt: string; hash: string };

const fromRow = (row: UserRow): StoredUser => ({
  id: row.id,
  email: row.email,
  createdAt: new Date(row.created_at).toISOString(),
  salt: row.salt,
  hash: row.hash,
});

async function readUsers(): Promise<StoredUser[]> {
  if (databaseConfigured()) {
    const rows = await query<UserRow>("SELECT id, email, created_at, salt, hash FROM users ORDER BY created_at");
    return rows.map(fromRow);
  }
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function findUser(where: { id?: string; email?: string }): Promise<StoredUser | undefined> {
  if (databaseConfigured()) {
    const rows = where.id
      ? await query<UserRow>("SELECT id, email, created_at, salt, hash FROM users WHERE id = $1", [where.id])
      : await query<UserRow>("SELECT id, email, created_at, salt, hash FROM users WHERE email = $1", [where.email]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const users = await readUsers();
  return users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
}

async function insertUser(user: StoredUser): Promise<void> {
  if (databaseConfigured()) {
    await query(
      "INSERT INTO users (id, email, created_at, salt, hash) VALUES ($1, $2, $3, $4, $5)",
      [user.id, user.email, user.createdAt, user.salt, user.hash],
    );
    return;
  }
  await writeUsers([...(await readUsers()), user]);
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

/** Signing key for session cookies: from the env, or generated once and stored. */
async function secret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;

  if (databaseConfigured()) {
    // A generated key has to be shared by every serverless instance.
    const rows = await query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'auth_secret'");
    if (rows[0]) return rows[0].value;
    const generated = crypto.randomBytes(32).toString("hex");
    await query(
      "INSERT INTO app_meta (key, value) VALUES ('auth_secret', $1) ON CONFLICT (key) DO NOTHING",
      [generated],
    );
    const stored = await query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'auth_secret'");
    return stored[0]?.value ?? generated;
  }

  try {
    return await fs.readFile(SECRET_FILE, "utf8");
  } catch {
    const generated = crypto.randomBytes(32).toString("hex");
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SECRET_FILE, generated, { mode: 0o600 });
    return generated;
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return "Enter a valid email address.";
  if (password.length < 8) return "The password needs at least 8 characters.";
  return null;
}

export async function createUser(email: string, password: string): Promise<User | { error: string }> {
  const normalized = normalizeEmail(email);
  if (await findUser({ email: normalized })) {
    return { error: "An account with this email already exists." };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: normalized,
    createdAt: new Date().toISOString(),
    salt,
    hash: hashPassword(password, salt),
  };
  await insertUser(user);
  return publicUser(user);
}

function publicUser(user: StoredUser): User {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    isAdmin: user.email === ADMIN_EMAIL,
  };
}

/**
 * Creates the admin account on first use from ADMIN_PASSWORD. The password is
 * never stored in the repository — without the variable no admin exists.
 */
export async function ensureAdmin(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) return;
  if (await findUser({ email: ADMIN_EMAIL })) return;
  await createUser(ADMIN_EMAIL, password);
}

export async function listUsers(): Promise<User[]> {
  return (await readUsers()).map(publicUser);
}

export async function deleteUser(userId: string): Promise<boolean> {
  const user = await findUser({ id: userId });
  if (!user || user.email === ADMIN_EMAIL) return false;
  if (databaseConfigured()) {
    await query("DELETE FROM users WHERE id = $1", [userId]);
    return true;
  }
  await writeUsers((await readUsers()).filter((u) => u.id !== userId));
  return true;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const user = await findUser({ email: normalizeEmail(email) });
  if (!user) return null;
  const candidate = Buffer.from(hashPassword(password, user.salt), "hex");
  const stored = Buffer.from(user.hash, "hex");
  if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) return null;
  return publicUser(user);
}

export async function createSessionToken(userId: string): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expires}`;
  const signature = crypto
    .createHmac("sha256", await secret())
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [userId, expires, signature] = token.split(".");
  if (!userId || !expires || !signature) return null;
  if (Number(expires) < Date.now()) return null;

  const expected = crypto
    .createHmac("sha256", await secret())
    .update(`${userId}.${expires}`)
    .digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const user = await findUser({ id: userId });
  return user ? publicUser(user) : null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
  secure: process.env.NODE_ENV === "production",
};
