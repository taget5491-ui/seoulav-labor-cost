import assert from "node:assert/strict";
import test from "node:test";
import { calculateRow, dayTypeFromDate, isKoreanPublicHoliday, weekdayLabel } from "../lib/labor.ts";

test("classifies Korean weekends and public holidays", () => {
  assert.equal(dayTypeFromDate("2026-08-05"), "weekday");
  assert.equal(weekdayLabel("2026-08-05"), "수");
  assert.equal(dayTypeFromDate("2026-08-08"), "saturday");
  assert.equal(weekdayLabel("2026-08-08"), "토");
  assert.equal(dayTypeFromDate("2026-08-09"), "holiday");
  assert.equal(isKoreanPublicHoliday("2026-08-15"), true);
  assert.equal(isKoreanPublicHoliday("2026-08-17"), true);
});

test("calculates self labor, selected overhead and row additional cost", () => {
  const total = calculateRow({
    id: "self-1", description: "설치", workSite: "DSR", workDate: "2026-08-08", dayType: "saturday",
    headcount: 2, days: 1, contractorType: "self", contractorName: "", contractorQuoteAmount: 0,
    applyOverhead: true, additionalCost: 20_000,
  });
  assert.equal(total.baseAmount, 600_000);
  assert.equal(total.adminAmount, 60_000);
  assert.equal(total.toolAmount, 18_000);
  assert.equal(total.surchargeAmount, 100_000);
  assert.equal(total.totalAmount, 798_000);
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
