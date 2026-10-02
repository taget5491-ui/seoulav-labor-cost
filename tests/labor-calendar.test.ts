import assert from "node:assert/strict";
import test from "node:test";
import { calculateRow, dayTypeFromDate, isKoreanPublicHoliday, requiresCustomDailyRate, weekdayLabel } from "../lib/labor.ts";

test("classifies Korean weekends and public holidays", () => {
  assert.equal(dayTypeFromDate("2026-08-05"), "weekday");
  assert.equal(weekdayLabel("2026-08-05"), "수");
  assert.equal(dayTypeFromDate("2026-08-08"), "saturday");
  assert.equal(weekdayLabel("2026-08-08"), "토");
  assert.equal(dayTypeFromDate("2026-08-09"), "holiday");
  assert.equal(isKoreanPublicHoliday("2026-08-15"), true);
  assert.equal(isKoreanPublicHoliday("2026-08-17"), true);
});

test("keeps self labor at 300,000 won without weekend or overhead surcharges", () => {
  const total = calculateRow({
    id: "self-1", description: "설치", workSite: "DSR", workDate: "2026-08-08", dayType: "saturday",
    headcount: 2, days: 1, contractorType: "self", contractorName: "", contractorQuoteAmount: 0,
    applyOverhead: true, additionalCost: 20_000,
  });
  assert.equal(total.baseAmount, 600_000);
  assert.equal(total.adminAmount, 0);
  assert.equal(total.toolAmount, 0);
  assert.equal(total.surchargeAmount, 0);
  assert.equal(total.totalAmount, 620_000);
});

test("uses the fixed 300,000 won daily rate for external contractors", () => {
  const total = calculateRow({
    id: "external-1", description: "설치", workSite: "DSR", workDate: "2026-08-05", dayType: "weekday",
    headcount: 3, days: 1, contractorType: "external", contractorName: "RTA", contractorQuoteAmount: 900_000,
    applyOverhead: false, additionalCost: 0,
  });
  assert.equal(total.baseAmount, 900_000);
  assert.equal(total.totalAmount, 900_000);
});

test("applies each contractor's automatic cost policy", () => {
  const common = {
    description: "설치", workSite: "DSR", workDate: "2026-08-05", dayType: "weekday" as const,
    headcount: 2, days: 1, contractorName: "", contractorQuoteAmount: 300_000,
    applyOverhead: false, additionalCost: 0,
  };
  const vsent = calculateRow({ ...common, id: "vsent", contractorType: "vsent" });
  const rta = calculateRow({ ...common, id: "rta", contractorType: "rta" });
  const coreworker = calculateRow({ ...common, id: "coreworker", contractorType: "coreworker" });

  assert.equal(vsent.adminAmount, 90_000);
  assert.equal(vsent.toolAmount, 0);
  assert.equal(vsent.totalAmount, 690_000);
  assert.equal(rta.adminAmount, 60_000);
  assert.equal(rta.toolAmount, 18_000);
  assert.equal(rta.totalAmount, 678_000);
  assert.equal(coreworker.mealAmount, 20_000);
  assert.equal(coreworker.totalAmount, 698_000);
});

test("uses 350,000 won for RTA and Coreworker at southern Samsung sites", () => {
  const common = {
    description: "설치", workSite: "DS평택", workDate: "2026-08-05", dayType: "weekday" as const,
    headcount: 2, days: 1, contractorName: "", contractorQuoteAmount: 0,
    applyOverhead: false, additionalCost: 0,
  };
  const rta = calculateRow({ ...common, id: "south-rta", contractorType: "rta" });
  const coreworker = calculateRow({ ...common, id: "south-core", contractorType: "coreworker" });
  assert.equal(rta.baseRate, 350_000);
  assert.equal(rta.baseAmount, 700_000);
  assert.equal(rta.totalAmount, 791_000);
  assert.equal(coreworker.baseRate, 350_000);
  assert.equal(coreworker.totalAmount, 811_000);
});

test("uses a custom entered rate for other companies and exempts named companies from prompting", () => {
  const custom = calculateRow({
    id: "custom", description: "설치", workSite: "사외", workDate: "2026-08-05", dayType: "weekday",
    headcount: 2, days: 1, contractorType: "direct", contractorName: "협력사A", contractorQuoteAmount: 0,
    applyOverhead: false, additionalCost: 0, baseRate: 420_000,
  });
  assert.equal(custom.baseAmount, 840_000);
  assert.equal(requiresCustomDailyRate("DS천안", "협력사A"), true);
  assert.equal(requiresCustomDailyRate("DS천안", "에스큐브랩"), false);
  assert.equal(requiresCustomDailyRate("DS온양", "VSEnt"), false);
  assert.equal(requiresCustomDailyRate("사외", "일리스"), false);
});

test("handles lunar holidays and Korean substitute-holiday rules", () => {
  assert.equal(isKoreanPublicHoliday("2026-02-17"), true);
  assert.equal(isKoreanPublicHoliday("2026-05-24"), true);
  assert.equal(isKoreanPublicHoliday("2026-05-25"), true);
  assert.equal(isKoreanPublicHoliday("2026-09-25"), true);
  assert.equal(isKoreanPublicHoliday("2026-09-28"), false);
  assert.equal(isKoreanPublicHoliday("2026-06-03"), true);
  assert.equal(isKoreanPublicHoliday("2026-07-17"), true);
});
