import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getD1 } from "@/db";

export type SessionUser = { userId: string; email: string; displayName: string; fullName: string | null; role: "admin" | "user"; active: boolean; mustChangePassword: boolean; canEdit: boolean };
export const SESSION_COOKIE = "labor_session";
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value: string) { return new Uint8Array(value.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []); }
async function sha256(value: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 }, key, 256);
  return `pbkdf2-sha256$210000$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, rounds, saltHex, expected] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !rounds || !saltHex || !expected) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: Number(rounds) }, key, 256));
  const actual = bytesToHex(bits);
  if (actual.length !== expected.length) return false;
  let mismatch = 0; for (let i = 0; i < actual.length; i += 1) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

function mapUser(row: Record<string, unknown>): SessionUser {
  return { userId: String(row.email), email: String(row.email), displayName: String(row.display_name || row.email), fullName: String(row.display_name || "") || null, role: row.role === "admin" ? "admin" : "user", active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password), canEdit: row.role === "admin" };
}

export async function authenticate(loginId: string, password: string) {
  const id = loginId.trim().toLowerCase();
  const db = getD1();
  let row = await db.prepare("SELECT * FROM app_users WHERE email = ?").bind(id).first<Record<string, unknown>>();
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!row && id === (runtime.BOOTSTRAP_ADMIN_ID || "admin").toLowerCase() && password === runtime.BOOTSTRAP_ADMIN_PASSWORD) {
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    await db.prepare("INSERT INTO app_users (email, user_id, display_name, role, active, password_hash, must_change_password, created_at, updated_at) VALUES (?, ?, '관리자', 'admin', 1, ?, 1, ?, ?)").bind(id, id, passwordHash, now, now).run();
    row = await db.prepare("SELECT * FROM app_users WHERE email = ?").bind(id).first<Record<string, unknown>>();
  }
  if (!row || !Boolean(row.active) || !await verifyPassword(password, String(row.password_hash || ""))) return null;
  return mapUser(row);
}

export async function createSession(user: SessionUser) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date(); const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  await getD1().prepare("INSERT INTO user_sessions (token_hash, user_email, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), user.email, expires.toISOString(), now.toISOString()).run();
  return { token, expires };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await getD1().prepare("SELECT u.* FROM user_sessions s JOIN app_users u ON u.email = s.user_email WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1").bind(await sha256(token), new Date().toISOString()).first<Record<string, unknown>>();
  return row ? mapUser(row) : null;
}

export async function requireSessionUser(returnTo: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?return_to=${encodeURIComponent(returnTo)}`);
  if (user.mustChangePassword && returnTo !== "/change-password") redirect("/change-password");
  return user;
}

export async function deleteSession(token: string | undefined) { if (token) await getD1().prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await sha256(token)).run(); }
