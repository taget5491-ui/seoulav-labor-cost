import { getD1 } from "@/db";
import { getSessionUser } from "@/lib/password-auth";
import { AnnualSchedule, type ScheduleProject } from "./annual-schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await getSessionUser();
  const db = getD1();
  const estimates = await db.prepare(
    `SELECT e.id, e.project_name, e.site_name, e.company_name, e.manager_name,
      e.start_date, e.end_date, e.status, e.archived_at
     FROM estimates e
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       AND e.archived_at IS NULL
     ORDER BY e.start_date, e.site_name, e.project_name`,
  ).all<Record<string, unknown>>();
  const entries = await db.prepare(
    `SELECT le.estimate_id, le.work_date FROM labor_entries le
     INNER JOIN estimates e ON e.id = le.estimate_id
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       AND e.archived_at IS NULL AND le.work_date <> ''
     ORDER BY le.work_date`,
  ).all<Record<string, unknown>>();

  const entryDates = new Map<string, string[]>();
  for (const entry of entries.results) {
    const id = String(entry.estimate_id);
    entryDates.set(id, [...(entryDates.get(id) ?? []), String(entry.work_date)]);
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
      startDate,
      endDate,
      status: String(item.status || "draft"),
    }];
  });
  return <AnnualSchedule projects={projects} displayName={user?.displayName ?? "방문자"} isAdmin={user?.role === "admin"} />;
}
