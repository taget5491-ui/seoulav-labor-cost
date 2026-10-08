import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { ensureAppUser } from "@/lib/app-users";
import { z } from "zod";

export const dynamic = "force-dynamic";
const userSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), role: z.enum(["admin", "user"]), active: z.boolean() });

async function requireAdmin() {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const user = await ensureAppUser(identity);
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
    await getD1().prepare(`INSERT INTO app_users (email, user_id, display_name, role, active, created_at, updated_at)
      VALUES (?, '', ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role, active = excluded.active, updated_at = excluded.updated_at`)
      .bind(input.email, input.email, input.role, input.active ? 1 : 0, now, now).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "이메일과 권한을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "사용자 권한을 저장하지 못했습니다." }, { status: 500 });
  }
}
