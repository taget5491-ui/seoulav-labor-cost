import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { LaborDashboard } from "./labor-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireChatGPTUser("/dashboard");
  const db = getD1();
  const estimates = await db.prepare(
    `SELECT e.* FROM estimates e
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
     ORDER BY e.updated_at DESC LIMIT 1000`,
  ).all<Record<string, unknown>>();
  const entries = await db.prepare(
    `SELECT le.* FROM labor_entries le INNER JOIN estimates e ON e.id = le.estimate_id
     WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
     ORDER BY le.estimate_id, le.sort_order`,
  ).all<Record<string, unknown>>();
  const entriesByEstimate = new Map<string, Record<string, unknown>[]>();
  for (const entry of entries.results) {
    const estimateId = String(entry.estimate_id);
    entriesByEstimate.set(estimateId, [...(entriesByEstimate.get(estimateId) ?? []), entry]);
  }
  const initialEstimates = estimates.results.map((item) => ({
    id: String(item.id), projectName: String(item.project_name ?? ""), siteName: String(item.site_name ?? ""),
    companyName: String(item.company_name ?? ""), managerName: String(item.manager_name ?? ""),
    startDate: String(item.start_date ?? ""), endDate: String(item.end_date ?? ""), status: String(item.status) as "draft" | "review" | "confirmed" | "closed",
    archivedAt: item.archived_at ? String(item.archived_at) : null, internalHeadcount: Number(item.internal_headcount ?? 0),
    internalLaborAmount: Number(item.internal_labor_amount ?? 0), quotedLaborAmount: Number(item.quoted_labor_amount ?? 0),
    totalAmount: Number(item.total_amount ?? 0), updatedAt: String(item.updated_at ?? ""),
    entries: (entriesByEstimate.get(String(item.id)) ?? []).map((entry) => ({
      id: String(entry.id), description: String(entry.description ?? ""), workSite: String(entry.work_site ?? ""),
      workDate: String(entry.work_date ?? ""), dayType: String(entry.day_type) as "weekday" | "saturday" | "holiday",
      headcount: Number(entry.headcount ?? 0), days: Number(entry.days ?? 0),
      contractorType: (entry.contractor_type === "legacy" ? "direct" : String(entry.contractor_type)) as "self" | "rta" | "vsent" | "coreworker" | "direct",
      contractorName: entry.contractor_type === "legacy" ? "기존 산정" : String(entry.contractor_name ?? ""),
      contractorQuoteAmount: Number(entry.contractor_type === "legacy" ? entry.total_amount : entry.contractor_quote_amount ?? 0),
      applyOverhead: Boolean(entry.apply_overhead), additionalCost: Number(entry.additional_cost ?? 0),
    })),
  }));
  return <LaborDashboard displayName={user.displayName} initialEstimates={initialEstimates} />;
}
