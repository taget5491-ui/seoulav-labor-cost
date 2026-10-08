import { getD1 } from "@/db";
import { getSessionUser, hashPassword } from "@/lib/password-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
const userSchema = z.object({ email: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/).transform((value) => value.toLowerCase()), password: z.string().min(10).max(100).optional(), role: z.enum(["admin", "user"]), active: z.boolean() });

async function requireAdmin() {
  const user = await getSessionUser();
  return user?.role === "admin" ? user : null;
}

export async function GET() {
  if (!await requireAdmin()) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const result = await getD1().prepare("SELECT email, display_name, role, active, updated_at FROM app_users ORDER BY role, email").all<Record<string, unknown>>();
  return Response.json({ users: result.results.map((row) => ({ email: row.email, displayName: row.display_name, role: row.role, active: Boolean(row.active), updatedAt: row.updated_at })) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  try {
    const input = userSchema.parse(await request.json());
    if (input.email === admin.email && (!input.active || input.role !== "admin")) return Response.json({ error: "현재 관리자 자신의 권한은 해제할 수 없습니다." }, { status: 400 });
    const now = new Date().toISOString();
    const existing = await getD1().prepare("SELECT email FROM app_users WHERE email = ?").bind(input.email).first();
    if (!existing && !input.password) return Response.json({ error: "새 계정의 임시 비밀번호를 입력해 주세요." }, { status: 400 });
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    await getD1().prepare(`INSERT INTO app_users (email, user_id, display_name, role, active, password_hash, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role, active = excluded.active, password_hash = COALESCE(?, app_users.password_hash), must_change_password = CASE WHEN ? IS NULL THEN app_users.must_change_password ELSE 1 END, updated_at = excluded.updated_at`)
      .bind(input.email, input.email, input.email, input.role, input.active ? 1 : 0, passwordHash || "", now, now, passwordHash, passwordHash).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "이메일과 권한을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "사용자 권한을 저장하지 못했습니다." }, { status: 500 });
  }
}
