import { getD1 } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { calculateEstimate, DEFAULT_RATES, type LaborRow } from "@/lib/labor";
import { z } from "zod";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "review", "confirmed", "closed"]);
const rowSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  workSite: z.string().trim().min(1).max(50),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayType: z.enum(["weekday", "saturday", "holiday"]),
  headcount: z.coerce.number().int().min(1).max(100),
  days: z.coerce.number().min(0.5).max(365),
  contractorType: z.enum(["self", "rta", "vsent", "coreworker", "direct"]),
  contractorName: z.string().trim().max(120).default(""),
  contractorQuoteAmount: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
  applyOverhead: z.boolean().default(false),
  additionalCost: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  useBaseRate: z.boolean().default(true),
  manualLaborAmount: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
  baseRate: z.coerce.number().int().min(0).max(10_000_000).default(DEFAULT_RATES.baseRate),
});
const estimateSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  siteName: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(120).default(""),
  managerName: z.string().trim().max(80).default(""),
  startDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  endDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  status: statusSchema.default("draft"),
  notes: z.string().trim().max(1000).default(""),
  extraCosts: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  internalHeadcount: z.coerce.number().int().min(0).max(100).default(0),
  internalDays: z.coerce.number().min(0).max(365).default(0),
  quotedLaborAmount: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
  quoteFileKey: z.union([z.literal(""), z.string().regex(/^quotes\/[0-9a-f-]+\.pdf$/i)]).default(""),
  quoteFileName: z.string().trim().max(180).default(""),
  quoteFileSize: z.coerce.number().int().min(0).max(10 * 1024 * 1024).default(0),
  sourceGroupId: z.string().nullable().optional(),
  allowLockedRevision: z.boolean().default(false),
  entries: z.array(rowSchema).min(1).max(100),
});
const archiveSchema = z.object({ groupId: z.string().min(1), action: z.enum(["archive", "restore"]) });

type DbRow = Record<string, unknown>;

async function currentUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV !== "production") return { userId: "local-preview", email: "preview@local" };
  return null;
}

function mapEntry(entry: DbRow) {
  const isLegacy = entry.contractor_type === "legacy";
  return {
    id: entry.id,
    description: entry.description,
    workSite: entry.work_site,
    workDate: entry.work_date,
    dayType: entry.day_type,
    headcount: entry.headcount,
    days: entry.days,
    contractorType: isLegacy ? "direct" : entry.contractor_type,
    contractorName: isLegacy ? "기존 산정" : entry.contractor_name,
    contractorQuoteAmount: isLegacy ? entry.total_amount : entry.contractor_quote_amount,
    applyOverhead: Boolean(entry.apply_overhead),
    additionalCost: Number(entry.additional_cost ?? 0),
    useBaseRate: entry.use_base_rate === undefined ? true : Boolean(entry.use_base_rate),
    manualLaborAmount: Number(entry.manual_labor_amount ?? 0),
    baseRate: Number(entry.base_rate ?? DEFAULT_RATES.baseRate),
  };
}

function mapEstimate(item: DbRow, entries: DbRow[], history: DbRow[] = []) {
  return {
    id: item.id,
    groupId: item.group_id,
    version: item.version,
    projectName: item.project_name,
    siteName: item.site_name || entries[0]?.work_site || "",
    companyName: item.company_name,
    managerName: item.manager_name,
    startDate: item.start_date,
    endDate: item.end_date,
    status: item.status,
    archivedAt: item.archived_at,
    notes: item.notes,
    extraCosts: item.extra_costs,
    internalHeadcount: item.internal_headcount,
    internalDays: item.internal_days,
    internalLaborAmount: item.internal_labor_amount,
    quotedLaborAmount: item.quoted_labor_amount,
    quoteFileKey: item.quote_file_key,
    quoteFileName: item.quote_file_name,
    quoteFileSize: item.quote_file_size,
    totalAmount: item.total_amount,
    createdByEmail: item.created_by_email,
    updatedAt: item.updated_at,
    entries: entries.map(mapEntry),
    history: history.map((version) => ({ id: version.id, version: version.version, status: version.status, totalAmount: version.total_amount, createdByEmail: version.created_by_email, updatedAt: version.updated_at })),
  };
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const db = getD1();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const item = await db.prepare("SELECT * FROM estimates WHERE id = ?").bind(id).first<DbRow>();
      if (!item) return Response.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
      const entries = await db.prepare("SELECT * FROM labor_entries WHERE estimate_id = ? ORDER BY sort_order").bind(id).all<DbRow>();
      return Response.json({ estimate: mapEstimate(item, entries.results) });
    }

    const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(1, Math.trunc(requestedLimit))) : 100;
    const estimatesResult = await db.prepare(
      `SELECT e.* FROM estimates e
       WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       ORDER BY e.updated_at DESC LIMIT ?`,
    ).bind(limit).all<DbRow>();
    const entriesResult = await db.prepare(
      `SELECT le.* FROM labor_entries le INNER JOIN estimates e ON e.id = le.estimate_id
       WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
       ORDER BY le.estimate_id, le.sort_order`,
    ).all<DbRow>();
    const historyResult = await db.prepare(
      `SELECT id, group_id, version, status, total_amount, created_by_email, updated_at
       FROM estimates ORDER BY group_id, version DESC LIMIT 500`,
    ).all<DbRow>();

    const entriesByEstimate = new Map<string, DbRow[]>();
    for (const entry of entriesResult.results) {
      const estimateId = String(entry.estimate_id);
      entriesByEstimate.set(estimateId, [...(entriesByEstimate.get(estimateId) ?? []), entry]);
    }
    const historyByGroup = new Map<string, DbRow[]>();
    for (const version of historyResult.results) {
      const groupId = String(version.group_id);
      historyByGroup.set(groupId, [...(historyByGroup.get(groupId) ?? []), version]);
    }
    return Response.json({ estimates: estimatesResult.results.map((item) => mapEstimate(item, entriesByEstimate.get(String(item.id)) ?? [], historyByGroup.get(String(item.group_id)) ?? [])) });
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
    if (input.startDate && input.endDate && input.startDate > input.endDate) return Response.json({ error: "종료일은 시작일과 같거나 이후 날짜로 선택할 수 있습니다." }, { status: 400 });
    const db = getD1();

    if (!input.sourceGroupId) {
      const duplicate = await db.prepare(
        `SELECT e.group_id FROM estimates e
         WHERE e.version = (SELECT MAX(e2.version) FROM estimates e2 WHERE e2.group_id = e.group_id)
           AND e.archived_at IS NULL AND TRIM(e.project_name) = TRIM(?)
           AND COALESCE(NULLIF(TRIM(e.site_name), ''), (
             SELECT le.work_site FROM labor_entries le WHERE le.estimate_id = e.id ORDER BY le.sort_order LIMIT 1
           )) = TRIM(?)
           AND TRIM(e.company_name) = TRIM(?) LIMIT 1`,
      ).bind(input.projectName, input.siteName, input.companyName).first<{ group_id: string }>();
      if (duplicate) return Response.json({ error: "같은 사업장·공사명·업체명의 견적이 이미 있습니다.", duplicateGroupId: duplicate.group_id }, { status: 409 });
    }

    const groupId = input.sourceGroupId || crypto.randomUUID();
    const latest = await db.prepare("SELECT version, status FROM estimates WHERE group_id = ? ORDER BY version DESC LIMIT 1").bind(groupId).first<{ version: number; status: string }>();
    if (latest && ["confirmed", "closed"].includes(latest.status) && !input.allowLockedRevision) return Response.json({ error: "확정 또는 종료된 견적입니다. 수정본 만들기를 선택해 주세요." }, { status: 423 });

    const version = Number(latest?.version ?? 0) + 1;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const calculation = calculateEstimate(input.entries.map((entry) => ({ ...entry, workSite: input.siteName })) as LaborRow[], input.extraCosts, DEFAULT_RATES, input.internalHeadcount, input.internalDays);
    const statements = [
      db.prepare(
        `INSERT INTO estimates (
          id, group_id, version, project_name, site_name, company_name, manager_name,
          start_date, end_date, status, archived_at, notes, extra_costs, internal_headcount,
          internal_days, internal_labor_amount, quoted_labor_amount, quote_file_key,
          quote_file_name, quote_file_size, total_amount, created_by, created_by_email,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, groupId, version, input.projectName, input.siteName, input.companyName, input.managerName, input.startDate, input.endDate, input.status, input.notes, calculation.extraCosts, calculation.internalHeadcount, calculation.internalDays, calculation.internalLaborAmount, input.quotedLaborAmount, input.quoteFileKey, input.quoteFileName, input.quoteFileSize, calculation.grandTotal, user.userId, user.email, now, now),
      ...calculation.rows.map((row, index) => db.prepare(
        `INSERT INTO labor_entries (
          id, estimate_id, description, work_site, work_date, day_type, headcount, days,
          contractor_type, contractor_name, contractor_quote_amount,
          apply_overhead, additional_cost, use_base_rate, manual_labor_amount,
          base_rate, admin_rate, tool_rate, day_surcharge, base_amount, admin_amount,
          tool_amount, surcharge_amount, total_amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, row.description, input.siteName, row.workDate, row.dayType, row.headcount, row.days, row.contractorType, row.contractorType === "self" ? "" : row.contractorName, row.contractorQuoteAmount, row.applyOverhead ? 1 : 0, row.additionalCost, row.useBaseRate ? 1 : 0, row.manualLaborAmount, row.baseRate, DEFAULT_RATES.adminRate, DEFAULT_RATES.toolRate, row.daySurcharge, row.baseAmount, row.adminAmount, row.toolAmount, row.surchargeAmount, row.totalAmount, index)),
    ];
    await db.batch(statements);
    return Response.json({ id, groupId, version, totalAmount: calculation.grandTotal });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "입력 내용을 확인해 주세요.", details: error.issues }, { status: 400 });
    console.error("Failed to save estimate", error);
    return Response.json({ error: "견적을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const input = archiveSchema.parse(await request.json());
    const archivedAt = input.action === "archive" ? new Date().toISOString() : null;
    const result = await getD1().prepare("UPDATE estimates SET archived_at = ? WHERE group_id = ?").bind(archivedAt, input.groupId).run();
    if (!result.meta.changes) return Response.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true, archivedAt });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "요청 내용을 확인해 주세요." }, { status: 400 });
    console.error("Failed to archive estimate", error);
    return Response.json({ error: "보관 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}
