import { getD1 } from "@/db";
import { getSessionUser } from "@/lib/password-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  id: z.string().uuid().optional(),
  siteName: z.string().trim().min(1).max(120),
  projectName: z.string().trim().min(1).max(180),
  managerName: z.string().trim().max(80).default(""),
  companyName: z.string().trim().max(120).default(""),
  riskGrade: z.string().trim().min(1).max(80).default("일반작업"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workDescription: z.string().trim().max(1000).default(""),
  status: z.enum(["planned", "active", "completed"]).default("planned"),
});

export async function GET() {
  try {
    const result = await getD1().prepare("SELECT * FROM project_plans ORDER BY start_date, site_name, project_name").all<Record<string, unknown>>();
    return Response.json({ plans: result.results.map((row) => ({
      id: String(row.id), siteName: String(row.site_name), projectName: String(row.project_name),
      managerName: String(row.manager_name || ""), companyName: String(row.company_name || ""),
      riskGrade: String(row.risk_grade || "일반작업"), startDate: String(row.start_date), endDate: String(row.end_date),
      workDescription: String(row.work_description || ""), status: String(row.status || "planned"), updatedAt: String(row.updated_at),
    })) });
  } catch (error) {
    console.error("Failed to load project plans", error);
    return Response.json({ error: "계획표를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.canEdit) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: user ? 403 : 401 });
  try {
    const input = planSchema.parse(await request.json());
    if (input.endDate < input.startDate) return Response.json({ error: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await getD1().prepare(`INSERT INTO project_plans (id, site_name, project_name, manager_name, company_name, risk_grade, start_date, end_date, work_description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, input.siteName, input.projectName, input.managerName, input.companyName, input.riskGrade, input.startDate, input.endDate, input.workDescription, input.status, user.email, now, now).run();
    return Response.json({ id });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "계획을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user?.canEdit) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: user ? 403 : 401 });
  try {
    const input = planSchema.extend({ id: z.string().uuid() }).parse(await request.json());
    if (input.endDate < input.startDate) return Response.json({ error: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
    const result = await getD1().prepare(`UPDATE project_plans SET site_name=?, project_name=?, manager_name=?, company_name=?, risk_grade=?, start_date=?, end_date=?, work_description=?, status=?, updated_at=? WHERE id=?`)
      .bind(input.siteName, input.projectName, input.managerName, input.companyName, input.riskGrade, input.startDate, input.endDate, input.workDescription, input.status, new Date().toISOString(), input.id).run();
    if (!result.meta.changes) return Response.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "계획을 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user?.canEdit) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: user ? 403 : 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "삭제할 계획이 없습니다." }, { status: 400 });
  const result = await getD1().prepare("DELETE FROM project_plans WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true });
}
