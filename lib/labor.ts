export type DayType = "weekday" | "saturday" | "holiday";

export type LaborRow = {
  id: string;
  description: string;
  workDate: string;
  dayType: DayType;
  headcount: number;
  days: number;
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

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  weekday: "평일",
  saturday: "토요일",
  holiday: "휴일",
};

export function dayTypeFromDate(date: string): DayType {
  if (!date) return "weekday";
  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 0) return "holiday";
  if (day === 6) return "saturday";
  return "weekday";
}

export function calculateRow(row: LaborRow, rates = DEFAULT_RATES) {
  const headcount = Math.max(0, Number(row.headcount) || 0);
  const days = Math.max(0, Number(row.days) || 0);
  const units = headcount * days;
  const baseAmount = Math.round(units * rates.baseRate);
  const adminAmount = Math.round(baseAmount * (rates.adminRate / 100));
  const toolAmount = Math.round(baseAmount * (rates.toolRate / 100));
  const daySurcharge = row.dayType === "holiday"
    ? rates.holidaySurcharge
    : row.dayType === "saturday"
      ? rates.saturdaySurcharge
      : 0;
  const surchargeAmount = Math.round(units * daySurcharge);

  return {
    units,
    daySurcharge,
    baseAmount,
    adminAmount,
    toolAmount,
    surchargeAmount,
    totalAmount: baseAmount + adminAmount + toolAmount + surchargeAmount,
  };
}

export function calculateEstimate(rows: LaborRow[], extraCosts = 0, rates = DEFAULT_RATES) {
  const calculatedRows = rows.map((row) => ({ ...row, ...calculateRow(row, rates) }));
  const totals = calculatedRows.reduce(
    (sum, row) => ({
      units: sum.units + row.units,
      baseAmount: sum.baseAmount + row.baseAmount,
      adminAmount: sum.adminAmount + row.adminAmount,
      toolAmount: sum.toolAmount + row.toolAmount,
      surchargeAmount: sum.surchargeAmount + row.surchargeAmount,
      totalAmount: sum.totalAmount + row.totalAmount,
    }),
    { units: 0, baseAmount: 0, adminAmount: 0, toolAmount: 0, surchargeAmount: 0, totalAmount: 0 },
  );
  const safeExtraCosts = Math.max(0, Math.round(Number(extraCosts) || 0));
  return {
    rows: calculatedRows,
    ...totals,
    extraCosts: safeExtraCosts,
    grandTotal: totals.totalAmount + safeExtraCosts,
  };
}

export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}
