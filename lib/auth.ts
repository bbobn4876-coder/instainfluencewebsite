import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

export type User = { id: string; email: string; createdAt: string; emailVerified: boolean };
type StoredUser = User & { salt: string; hash: string };

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "secret");

export const SESSION_COOKIE = "loomera_session";
const SESSION_DAYS = 30;

async function readUsers(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

/** Signing key for session cookies: from the env, or generated once and stored. */
async function secret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
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
  const users = await readUsers();
  const normalized = normalizeEmail(email);
  if (users.some((u) => u.email === normalized)) {
    return { error: "An account with this email already exists." };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: normalized,
    createdAt: new Date().toISOString(),
    emailVerified: false,
    salt,
    hash: hashPassword(password, salt),
  };
  await writeUsers([...users, user]);
  return publicUser(user);
}

function publicUser(user: StoredUser): User {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function userByEmail(email: string): Promise<User | null> {
  const users = await readUsers();
  const user = users.find((u) => u.email === normalizeEmail(email));
  return user ? publicUser(user) : null;
}

export async function markVerified(userId: string): Promise<User | null> {
  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.emailVerified = true;
  await writeUsers(users);
  return publicUser(user);
}

export async function setPassword(userId: string, password: string): Promise<boolean> {
  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  user.salt = crypto.randomBytes(16).toString("hex");
  user.hash = hashPassword(password, user.salt);
  // Resetting the password through the mailbox proves the address works.
  user.emailVerified = true;
  await writeUsers(users);
  return true;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const users = await readUsers();
  const user = users.find((u) => u.email === normalizeEmail(email));
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

  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  return user ? publicUser(user) : null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
  secure: process.env.NODE_ENV === "production",
};
