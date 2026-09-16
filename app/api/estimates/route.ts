import { getD1 } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { calculateEstimate, DEFAULT_RATES, type LaborRow } from "@/lib/labor";
import { z } from "zod";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1).max(100),
  workSite: z.string().trim().min(1).max(50),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayType: z.enum(["weekday", "saturday", "holiday"]),
  headcount: z.coerce.number().int().min(1).max(100),
  days: z.coerce.number().min(0.5).max(365),
});

const estimateSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  siteName: z.string().trim().max(120).default(""),
  companyName: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
  extraCosts: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  internalHeadcount: z.coerce.number().int().min(0).max(100).default(0),
  internalDays: z.coerce.number().min(0).max(365).default(0),
  sourceGroupId: z.string().nullable().optional(),
  entries: z.array(rowSchema).min(1).max(100),
});

async function currentUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV !== "production") {
    return { userId: "local-preview", email: "preview@local" };
  }
  return null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const db = getD1();
    const estimatesResult = await db.prepare(
      `SELECT e.* FROM estimates e
       WHERE e.version = (
         SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id
       )
       ORDER BY e.updated_at DESC LIMIT 50`,
    ).all<Record<string, unknown>>();
    const entriesResult = await db.prepare(
      `SELECT le.* FROM labor_entries le
       INNER JOIN estimates e ON e.id = le.estimate_id
       WHERE e.version = (
         SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id
       )
       ORDER BY le.estimate_id, le.sort_order`,
    ).all<Record<string, unknown>>();

    const entriesByEstimate = new Map<string, Record<string, unknown>[]>();
    for (const entry of entriesResult.results) {
      const estimateId = String(entry.estimate_id);
      entriesByEstimate.set(estimateId, [...(entriesByEstimate.get(estimateId) ?? []), entry]);
    }

    return Response.json({
      estimates: estimatesResult.results.map((item) => ({
        id: item.id,
        groupId: item.group_id,
        version: item.version,
        projectName: item.project_name,
        siteName: item.site_name,
        companyName: item.company_name,
        status: item.status,
        notes: item.notes,
        extraCosts: item.extra_costs,
        internalHeadcount: item.internal_headcount,
        internalDays: item.internal_days,
        internalLaborAmount: item.internal_labor_amount,
        totalAmount: item.total_amount,
        createdByEmail: item.created_by_email,
        updatedAt: item.updated_at,
        entries: (entriesByEstimate.get(String(item.id)) ?? []).map((entry) => ({
          id: entry.id,
          description: entry.description,
          workSite: entry.work_site,
          workDate: entry.work_date,
          dayType: entry.day_type,
          headcount: entry.headcount,
          days: entry.days,
        })),
      })),
    });
  } catch (error) {
    console.error("Failed to load estimates", error);
    return Response.json({ error: "저장된 견적을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const input = estimateSchema.parse(await request.json());
    const db = getD1();
    const groupId = input.sourceGroupId || crypto.randomUUID();
    const versionResult = await db
      .prepare("SELECT COALESCE(MAX(version), 0) AS latest FROM estimates WHERE group_id = ?")
      .bind(groupId)
      .first<{ latest: number }>();
    const version = Number(versionResult?.latest ?? 0) + 1;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const calculation = calculateEstimate(
      input.entries as LaborRow[],
      input.extraCosts,
      DEFAULT_RATES,
      input.internalHeadcount,
      input.internalDays,
    );

    const statements = [
      db.prepare(
        `INSERT INTO estimates (
          id, group_id, version, project_name, site_name, company_name, status, notes,
          extra_costs, internal_headcount, internal_days, internal_labor_amount,
          total_amount, created_by, created_by_email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, groupId, version, input.projectName, input.siteName, input.companyName,
        input.notes, calculation.extraCosts, calculation.internalHeadcount,
        calculation.internalDays, calculation.internalLaborAmount,
        calculation.grandTotal, user.userId, user.email, now, now,
      ),
      ...calculation.rows.map((row, index) => db.prepare(
        `INSERT INTO labor_entries (
          id, estimate_id, description, work_site, work_date, day_type, headcount, days,
          base_rate, admin_rate, tool_rate, day_surcharge, base_amount,
          admin_amount, tool_amount, surcharge_amount, total_amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), id, row.description, row.workSite, row.workDate, row.dayType,
        row.headcount, row.days, DEFAULT_RATES.baseRate, DEFAULT_RATES.adminRate,
        DEFAULT_RATES.toolRate, row.daySurcharge, row.baseAmount, row.adminAmount,
        row.toolAmount, row.surchargeAmount, row.totalAmount, index,
      )),
    ];
    await db.batch(statements);
    return Response.json({ id, groupId, version, totalAmount: calculation.grandTotal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "입력 내용을 확인해 주세요.", details: error.issues }, { status: 400 });
    }
    console.error("Failed to save estimate", error);
    return Response.json({ error: "견적을 저장하지 못했습니다." }, { status: 500 });
  }
}
