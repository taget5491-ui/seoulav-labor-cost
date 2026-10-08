import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";

export type AppRole = "admin" | "user";
export type AppUser = ChatGPTUser & { role: AppRole; active: boolean };

export async function ensureAppUser(user: ChatGPTUser): Promise<AppUser | null> {
  const db = getD1();
  const email = user.email.trim().toLowerCase();
  let saved = await db.prepare("SELECT email, role, active FROM app_users WHERE email = ?").bind(email).first<Record<string, unknown>>();
  if (!saved) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM app_users").first<{ count: number }>();
    const role: AppRole = Number(count?.count ?? 0) === 0 ? "admin" : "user";
    const now = new Date().toISOString();
    await db.prepare("INSERT OR IGNORE INTO app_users (email, user_id, display_name, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .bind(email, user.userId, user.displayName, role, now, now).run();
    saved = await db.prepare("SELECT email, role, active FROM app_users WHERE email = ?").bind(email).first<Record<string, unknown>>();
  } else {
    await db.prepare("UPDATE app_users SET user_id = ?, display_name = ?, updated_at = ? WHERE email = ?")
      .bind(user.userId, user.displayName, new Date().toISOString(), email).run();
  }
  if (!saved || !Boolean(saved.active)) return null;
  return { ...user, email, role: saved.role === "admin" ? "admin" : "user", active: true };
}
