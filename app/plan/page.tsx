import { getD1 } from "@/db";
import { getSessionUser } from "@/lib/password-auth";
import { ProjectPlanBoard, type PlanItem } from "./project-plan-board";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const user = await getSessionUser();
  const db = getD1();
  const plans = await db.prepare("SELECT * FROM project_plans WHERE end_date >= date('now', '+9 hours') ORDER BY start_date, site_name, project_name").all<Record<string, unknown>>();
  const items: PlanItem[] = plans.results.map((row) => ({ id: String(row.id), source: "manual" as const, siteName: String(row.site_name), projectName: String(row.project_name), managerName: String(row.manager_name || ""), companyName: String(row.company_name || ""), riskGrade: String(row.risk_grade || "일반작업"), startDate: String(row.start_date), endDate: String(row.end_date), workDescription: String(row.work_description || ""), status: String(row.status || "planned") }));
  return <ProjectPlanBoard initialItems={items} displayName={user?.displayName ?? "방문자"} canEdit={Boolean(user?.canEdit)} />;
}
