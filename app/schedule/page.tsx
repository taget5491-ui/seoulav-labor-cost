import { getD1 } from "@/db";
import { getSessionUser } from "@/lib/password-auth";
import { AnnualSchedule, type ScheduleProject } from "./annual-schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await getSessionUser();
  const db = getD1();
  const estimates = await db.prepare(
    `SELECT e.id, e.project_name, e.site_name, e.company_name, e.manager_name, e.risk_grade,
      e.start_date, e.end_date, e.status, e.archived_at, e.quoted_labor_amount, e.total_amount
     FROM estimates e
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       AND e.archived_at IS NULL
     ORDER BY e.start_date, e.site_name, e.project_name`,
  ).all<Record<string, unknown>>();
  const entries = await db.prepare(
    `SELECT le.estimate_id, le.work_date, le.contractor_type, le.contractor_name, le.total_amount FROM labor_entries le
     INNER JOIN estimates e ON e.id = le.estimate_id
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       AND e.archived_at IS NULL AND le.work_date <> ''
     ORDER BY le.work_date`,
  ).all<Record<string, unknown>>();

  const entryDates = new Map<string, string[]>();
  const companyCosts = new Map<string, Map<string, number>>();
  for (const entry of entries.results) {
    const id = String(entry.estimate_id);
    entryDates.set(id, [...(entryDates.get(id) ?? []), String(entry.work_date)]);
    const company = entry.contractor_type === "self" ? "공무기술팀" : String(entry.contractor_name || "기타 업체");
    const costs = companyCosts.get(id) ?? new Map<string, number>();
    costs.set(company, (costs.get(company) ?? 0) + Number(entry.total_amount || 0));
    companyCosts.set(id, costs);
  }
  const projects: ScheduleProject[] = estimates.results.flatMap((item) => {
    const dates = entryDates.get(String(item.id)) ?? [];
    const startDate = String(item.start_date || dates[0] || "");
    const endDate = String(item.end_date || dates.at(-1) || startDate);
    if (!startDate || !endDate) return [];
    return [{
      id: String(item.id),
      projectName: String(item.project_name || ""),
      siteName: String(item.site_name || "미지정"),
      companyName: String(item.company_name || "-"),
      managerName: String(item.manager_name || "-"),
      riskGrade: String(item.risk_grade || "일반작업"),
      startDate,
      endDate,
      status: String(item.status || "draft"),
      quotedLaborAmount: Number(item.quoted_labor_amount || 0),
      actualLaborAmount: Number(item.total_amount || 0),
      companyCosts: [...(companyCosts.get(String(item.id)) ?? new Map<string, number>())].map(([name, amount]) => ({ name, amount })),
    }];
  });
  return <AnnualSchedule projects={projects} displayName={user?.displayName ?? "방문자"} isAdmin={user?.role === "admin"} />;
}
