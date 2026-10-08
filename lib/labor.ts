export type DayType = "weekday" | "saturday" | "holiday";
export type ContractorType = "self" | "rta" | "vsent" | "coreworker" | "direct";

export type LaborRow = {
  id: string;
  description: string;
  workSite: string;
  workDate: string;
  dayType: DayType;
  headcount: number;
  days: number;
  contractorType: ContractorType;
  contractorName: string;
  contractorQuoteAmount: number;
  applyOverhead: boolean;
  additionalCost: number;
  useBaseRate?: boolean;
  manualLaborAmount?: number;
  baseRate?: number;
};

export type LaborRates = {
  baseRate: number;
  adminRate: number;
  toolRate: number;
  saturdaySurcharge: number;
  holidaySurcharge: number;
};

export const DEFAULT_RATES: LaborRates = {
  baseRate: 300_000,
  adminRate: 10,
  toolRate: 3,
  saturdaySurcharge: 50_000,
  holidaySurcharge: 100_000,
};

export const INTERNAL_LABOR_RATE = 300_000;
export const SOUTHERN_SITE_DAILY_RATE = 350_000;

const SOUTHERN_SITES = new Set(["DS평택", "DS천안", "DS온양", "SDI천안"]);
const CUSTOM_RATE_SITES = new Set([...SOUTHERN_SITES, "사외"]);
const CUSTOM_RATE_EXEMPT_COMPANIES = new Set(["에스큐브랩", "vsent", "일리스"]);

function normalizedCompanyName(value: string) {
  return value.toLowerCase().replace(/[\s().㈜주식회사-]/g, "");
}

export function requiresCustomDailyRate(workSite: string, contractorName: string) {
  return CUSTOM_RATE_SITES.has(workSite) && Boolean(contractorName.trim()) && !CUSTOM_RATE_EXEMPT_COMPANIES.has(normalizedCompanyName(contractorName));
}

export function dailyRateForRow(row: Pick<LaborRow, "workSite" | "contractorType" | "baseRate">, rates = DEFAULT_RATES) {
  if (row.contractorType === "self") return INTERNAL_LABOR_RATE;
  if (SOUTHERN_SITES.has(row.workSite) && ["rta", "coreworker"].includes(row.contractorType)) return SOUTHERN_SITE_DAILY_RATE;
  return Math.max(0, Math.round(Number(row.baseRate) || rates.baseRate));
}

export const CONTRACTOR_TYPE_LABELS: Record<ContractorType, string> = {
  self: "자체",
  rta: "RTA",
  vsent: "VSEnt",
  coreworker: "코어워커",
  direct: "직접입력",
};

export const WORK_SITES = [
  "DS기흥",
  "DS화성",
  "DSR",
  "DS평택",
  "DS온양",
  "DS천안",
  "SAIT",
  "The UniverSE",
  "동탄DS큐브",
  "DS에듀센터 동탄",
  "DS에듀센터 탕정",
  "DX인재개발원",
  "SDI기흥",
  "SDI천안",
  "SDC",
  "사외",
] as const;

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  weekday: "평일",
  saturday: "토요일",
  holiday: "휴일",
};

export function contractorCostPolicy(row: Pick<LaborRow, "contractorType" | "applyOverhead" | "useBaseRate">, rates = DEFAULT_RATES) {
  if (row.useBaseRate === false) return { adminRate: 0, toolRate: 0, mealRate: 0, automatic: false, label: "직접입력" };
  if (row.contractorType === "self") return { adminRate: 0, toolRate: 0, mealRate: 0, automatic: true, label: "30만원 고정" };
  if (row.contractorType === "vsent") return { adminRate: 15, toolRate: 0, mealRate: 0, automatic: true, label: "관리비 15%" };
  if (row.contractorType === "rta") return { adminRate: 10, toolRate: 3, mealRate: 0, automatic: true, label: "관리비 10% + 공구 3%" };
  if (row.contractorType === "coreworker") return { adminRate: 10, toolRate: 3, mealRate: 10_000, automatic: true, label: "관리비 10% + 공구 3% + 식대 1만원" };
  if (row.applyOverhead) return { adminRate: rates.adminRate, toolRate: rates.toolRate, mealRate: 0, automatic: false, label: `관리비 ${rates.adminRate}% + 공구 ${rates.toolRate}%` };
  return { adminRate: 0, toolRate: 0, mealRate: 0, automatic: false, label: "미적용" };
}

const holidayCache = new Map<number, Set<string>>();
const KNOWN_ELECTION_HOLIDAYS = new Set(["2025-06-03", "2026-06-03"]);
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function addDateDays(value: string, days: number) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function koreanHolidaySet(year: number) {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = new Set<string>();
  const groups: Array<{ dates: string[]; substitute: "none" | "weekend" | "sunday_or_collision" }> = [];
  for (const targetYear of [year - 1, year, year + 1]) {
    const fixed: Array<[string, "none" | "weekend"]> = [
      [`${targetYear}-01-01`, "none"], [`${targetYear}-03-01`, "weekend"], [`${targetYear}-05-05`, "weekend"],
      [`${targetYear}-06-06`, "none"], [`${targetYear}-08-15`, "weekend"], [`${targetYear}-10-03`, "weekend"],
      [`${targetYear}-10-09`, "weekend"], [`${targetYear}-12-25`, "weekend"],
    ];
    if (targetYear >= 2026) fixed.push([`${targetYear}-07-17`, "none"]);
    fixed.forEach(([date, substitute]) => groups.push({ dates: [date], substitute }));
  }

  const lunarByYear = new Map<number, { seollal: string[]; buddha: string[]; chuseok: string[] }>();
  const lunarFormatter = new Intl.DateTimeFormat("en-u-ca-chinese", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });
  const scanStart = new Date(Date.UTC(year - 1, 10, 1, 12));
  const scanEnd = new Date(Date.UTC(year + 1, 1, 1, 12));
  for (let cursor = scanStart; cursor <= scanEnd; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const parts = lunarFormatter.format(cursor).match(/^(\d+)\/(\d+)\/(\d+)$/);
    if (!parts) continue;
    const lunarMonth = Number(parts[1]);
    const lunarDay = Number(parts[2]);
    const solarYear = cursor.getUTCFullYear();
    const bucket = lunarByYear.get(solarYear) ?? { seollal: [], buddha: [], chuseok: [] };
    if (lunarMonth === 1 && lunarDay === 1) bucket.seollal = [addDateDays(isoDate(cursor), -1), isoDate(cursor), addDateDays(isoDate(cursor), 1)];
    if (lunarMonth === 4 && lunarDay === 8) bucket.buddha = [isoDate(cursor)];
    if (lunarMonth === 8 && lunarDay === 15) bucket.chuseok = [addDateDays(isoDate(cursor), -1), isoDate(cursor), addDateDays(isoDate(cursor), 1)];
    lunarByYear.set(solarYear, bucket);
  }
  for (const bucket of lunarByYear.values()) {
    if (bucket.seollal.length) groups.push({ dates: bucket.seollal, substitute: "sunday_or_collision" });
    if (bucket.buddha.length) groups.push({ dates: bucket.buddha, substitute: "weekend" });
    if (bucket.chuseok.length) groups.push({ dates: bucket.chuseok, substitute: "sunday_or_collision" });
  }

  const occurrenceCount = new Map<string, number>();
  groups.forEach((group) => group.dates.forEach((date) => occurrenceCount.set(date, (occurrenceCount.get(date) ?? 0) + 1)));
  groups.forEach((group) => group.dates.forEach((date) => holidays.add(date)));
  KNOWN_ELECTION_HOLIDAYS.forEach((date) => holidays.add(date));
  for (const group of groups.filter((item) => item.substitute !== "none")) {
    const overlapsHoliday = group.dates.some((date) => {
      const day = dateFromIso(date).getUTCDay();
      const weekendOverlap = group.substitute === "weekend" ? day === 0 || day === 6 : day === 0;
      return weekendOverlap || (occurrenceCount.get(date) ?? 0) > 1;
    });
    if (!overlapsHoliday) continue;
    let substitute = addDateDays(group.dates[group.dates.length - 1], 1);
    while (holidays.has(substitute) || [0, 6].includes(dateFromIso(substitute).getUTCDay())) substitute = addDateDays(substitute, 1);
    holidays.add(substitute);
  }
  const result = new Set([...holidays].filter((date) => date.startsWith(`${year}-`)));
  holidayCache.set(year, result);
  return result;
}

export function isKoreanPublicHoliday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return koreanHolidaySet(Number(date.slice(0, 4))).has(date);
}

export function weekdayLabel(date: string) {
  if (!date) return "";
  return WEEKDAY_LABELS[dateFromIso(date).getUTCDay()];
}

export function dayTypeFromDate(date: string): DayType {
  if (!date) return "weekday";
  const day = dateFromIso(date).getUTCDay();
  if (day === 0 || isKoreanPublicHoliday(date)) return "holiday";
  if (day === 6) return "saturday";
  return "weekday";
}

export function calculateRow(row: LaborRow, rates = DEFAULT_RATES) {
  const headcount = Math.max(0, Number(row.headcount) || 0);
  const days = Math.max(0, Number(row.days) || 0);
  const useBaseRate = row.useBaseRate !== false;
  const units = useBaseRate ? headcount * days : 0;
  const contractorQuoteAmount = Math.max(0, Math.round(Number(row.contractorQuoteAmount) || 0));
  const manualLaborAmount = Math.max(0, Math.round(Number(row.manualLaborAmount) || 0));
  const baseRate = dailyRateForRow(row, rates);
  const baseAmount = useBaseRate ? Math.round(units * baseRate) : manualLaborAmount;
  const policy = contractorCostPolicy(row, rates);
  const adminAmount = Math.round(baseAmount * (policy.adminRate / 100));
  const toolAmount = Math.round(baseAmount * (policy.toolRate / 100));
  const mealAmount = Math.round(units * policy.mealRate);
  const daySurcharge = row.contractorType === "self" ? 0 : row.dayType === "holiday"
    ? rates.holidaySurcharge
    : row.dayType === "saturday"
      ? rates.saturdaySurcharge
      : 0;
  const surchargeAmount = Math.round(units * daySurcharge);
  const additionalCost = Math.max(0, Math.round(Number(row.additionalCost) || 0));

  return {
    units,
    daySurcharge,
    baseAmount,
    adminAmount,
    toolAmount,
    mealAmount,
    surchargeAmount,
    additionalCost,
    useBaseRate,
    manualLaborAmount,
    baseRate,
    totalAmount: baseAmount + adminAmount + toolAmount + mealAmount + surchargeAmount + additionalCost,
    contractorQuoteAmount,
  };
}

export function calculateEstimate(
  rows: LaborRow[],
  extraCosts = 0,
  rates = DEFAULT_RATES,
  internalHeadcount = 0,
  internalDays = 0,
  includeInternalLabor = true,
) {
  const contractorKey = (row: Pick<LaborRow, "contractorType" | "contractorName">) =>
    (row.contractorName || CONTRACTOR_TYPE_LABELS[row.contractorType] || "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
  const manualOverrideCompanies = new Set(rows
    .filter((row) => row.contractorType !== "self" && row.useBaseRate === false && Number(row.manualLaborAmount || 0) > 0)
    .map(contractorKey)
    .filter(Boolean));
  const calculatedRows = rows.map((row) => {
    const calculated = calculateRow(row, rates);
    const overriddenByManualAmount = row.contractorType !== "self" && row.useBaseRate !== false && manualOverrideCompanies.has(contractorKey(row));
    return overriddenByManualAmount ? {
      ...row,
      ...calculated,
      baseAmount: 0,
      adminAmount: 0,
      toolAmount: 0,
      mealAmount: 0,
      surchargeAmount: 0,
      additionalCost: 0,
      totalAmount: 0,
      overriddenByManualAmount: true,
    } : { ...row, ...calculated, overriddenByManualAmount: false };
  });
  const totals = calculatedRows.reduce(
    (sum, row) => ({
      units: sum.units + row.units,
      baseAmount: sum.baseAmount + row.baseAmount,
      adminAmount: sum.adminAmount + row.adminAmount,
      toolAmount: sum.toolAmount + row.toolAmount,
      mealAmount: sum.mealAmount + row.mealAmount,
      surchargeAmount: sum.surchargeAmount + row.surchargeAmount,
      totalAmount: sum.totalAmount + row.totalAmount,
    }),
    { units: 0, baseAmount: 0, adminAmount: 0, toolAmount: 0, mealAmount: 0, surchargeAmount: 0, totalAmount: 0 },
  );
  const safeExtraCosts = Math.max(0, Math.round(Number(extraCosts) || 0));
  const legacyInternalUnits = Math.max(0, Math.floor(Number(internalHeadcount) || 0)) * Math.max(0, Number(internalDays) || 0);
  const internalRows = calculatedRows.filter((row) => row.contractorType === "self");
  const externalRows = calculatedRows.filter((row) => row.contractorType !== "self");
  const internalWorkUnits = internalRows.reduce((sum, row) => sum + row.units, 0) || legacyInternalUnits;
  const calculatedInternalLaborAmount = internalRows.length ? internalRows.reduce((sum, row) => sum + row.totalAmount, 0) : Math.round(legacyInternalUnits * INTERNAL_LABOR_RATE);
  const internalLaborAmount = includeInternalLabor ? calculatedInternalLaborAmount : 0;
  const externalContractorAmount = externalRows.reduce((sum, row) => sum + row.totalAmount, 0);
  return {
    rows: calculatedRows,
    ...totals,
    extraCosts: safeExtraCosts,
    internalHeadcount: internalRows.reduce((sum, row) => sum + row.headcount, 0),
    internalDays: internalRows.reduce((sum, row) => sum + row.days, 0),
    internalWorkUnits,
    internalLaborAmount,
    externalContractorAmount,
    grandTotal: externalContractorAmount + internalLaborAmount,
    totalCost: externalContractorAmount + internalLaborAmount + safeExtraCosts,
  };
}

export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}
