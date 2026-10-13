import { getD1 } from "@/db";
import { getSessionUser } from "@/lib/password-auth";
import { ProjectPlanBoard, type PlanItem } from "./project-plan-board";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const user = await getSessionUser();
  const db = getD1();
  const [plans, estimates] = await Promise.all([
    db.prepare("SELECT * FROM project_plans ORDER BY start_date, site_name, project_name").all<Record<string, unknown>>(),
    db.prepare(`SELECT e.id, e.project_name, e.site_name, e.company_name, e.manager_name, e.risk_grade, e.start_date, e.end_date, e.status
      FROM estimates e WHERE e.version=(SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id=e.group_id)
      AND e.archived_at IS NULL AND e.start_date <> '' ORDER BY e.start_date, e.site_name, e.project_name`).all<Record<string, unknown>>(),
  ]);
  const items: PlanItem[] = [
    ...estimates.results.map((row) => ({ id: `estimate:${row.id}`, source: "estimate" as const, siteName: String(row.site_name || "미지정"), projectName: String(row.project_name), managerName: String(row.manager_name || ""), companyName: String(row.company_name || ""), riskGrade: String(row.risk_grade || "일반작업"), startDate: String(row.start_date), endDate: String(row.end_date || row.start_date), workDescription: "노무비 산정 공사", status: row.status === "closed" ? "completed" : "active" })),
    ...plans.results.map((row) => ({ id: String(row.id), source: "manual" as const, siteName: String(row.site_name), projectName: String(row.project_name), managerName: String(row.manager_name || ""), companyName: String(row.company_name || ""), riskGrade: String(row.risk_grade || "일반작업"), startDate: String(row.start_date), endDate: String(row.end_date), workDescription: String(row.work_description || ""), status: String(row.status || "planned") })),
  ];
  return <ProjectPlanBoard initialItems={items} displayName={user?.displayName ?? "방문자"} canEdit={Boolean(user?.canEdit)} />;
}
