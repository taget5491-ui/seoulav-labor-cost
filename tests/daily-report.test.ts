import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompany, parseDailyReport, planDailyReportImport } from "../lib/daily-report.ts";
import type { PositionedPdfText } from "../types/daily-report.ts";

function line(y: number, entries: Array<[number, string]>): PositionedPdfText[] {
  return entries.map(([x, text]) => ({ text, x, y, width: text.length * 6 }));
}

test("normalizes known and custom companies", () => {
  assert.deepEqual(normalizeCompany("(주)서울영상테크"), { contractorType: "self", contractorName: "" });
  assert.deepEqual(normalizeCompany(" rTa "), { contractorType: "rta", contractorName: "RTA" });
  assert.deepEqual(normalizeCompany("VS Ent"), { contractorType: "vsent", contractorName: "VSEnt" });
  assert.deepEqual(normalizeCompany("협력사A"), { contractorType: "direct", contractorName: "협력사A" });
});

test("parses project, dates, work and daytime labor candidates", () => {
  const items = [
    ...line(760, [[45, "공 사 명"], [150, "DSR B타워 AV시스템 구축"], [390, "전체 공정률"], [500, "5%"]]),
    ...line(730, [[45, "주요 작업 내용"], [155, "장비 철거"]]),
    ...line(700, [[45, "공사기간"], [150, "2026-08-05 ~ 2026-10-31"], [330, "작성일자"], [410, "2026년 8월 5일 수요일"]]),
    ...line(600, [[220, "금일 작업 현황"], [420, "다음 작업 현황"]]),
    ...line(575, [[155, "장비철거"], [360, "천장 배관 포설"]]),
    ...line(565, [[155, "세부 작업 목록"], [360, "후속 작업"]]),
    ...line(500, [[120, "업체명"], [160, "서울영상테크"], [220, "RTA"], [350, "서울영상테크"]]),
    ...line(490, [[120, "주간"], [170, "3"], [225, "3"], [370, "3"]]),
    ...line(470, [[120, "업체명"]]),
    ...line(460, [[120, "야간"]]),
  ];
  const result = parseDailyReport(items, 595);
  assert.equal(result.projectName, "DSR B타워 AV시스템 구축");
  assert.equal(result.inferredSiteName, "DSR");
  assert.equal(result.startDate, "2026-08-05");
  assert.equal(result.endDate, "2026-10-31");
  assert.equal(result.reportDate, "2026-08-05");
  assert.match(result.todayWork, /장비철거/);
  assert.match(result.nextWork, /천장 배관 포설/);
  assert.deepEqual(result.laborCandidates.map(({ contractorType, headcount }) => ({ contractorType, headcount })), [
    { contractorType: "self", headcount: 3 },
    { contractorType: "rta", headcount: 3 },
  ]);
  const plan = planDailyReportImport(result.laborCandidates, Object.fromEntries(result.laborCandidates.map((candidate) => [candidate.id, "add"])));
  assert.equal(plan.internalWorkUnits, 3);
  assert.deepEqual(plan.internalCandidates.map((candidate) => candidate.sourceCompanyName), ["서울영상테크"]);
  assert.deepEqual(plan.externalCandidates.map((candidate) => candidate.sourceCompanyName), ["RTA"]);
  assert.equal(plan.externalCandidates[0].contractorQuoteAmount, 300_000);
});

test("uses the date after 작성일자 instead of the construction start date", () => {
  const items = [
    ...line(700, [[45, "공사기간"], [150, "2026-08-05 ~ 2026-10-31"], [330, "작성일자"], [410, "2026. 08. 12"]]),
    ...line(600, [[220, "금일 작업 현황"]]),
    ...line(500, [[120, "업체명"], [160, "RTA"], [220, "서울영상테크"]]),
    ...line(490, [[120, "주간"], [160, "2명"], [220, "3명"]]),
  ];
  const result = parseDailyReport(items, 595);
  assert.equal(result.reportDate, "2026-08-12");
  assert.deepEqual(result.laborCandidates.map(({ contractorType, headcount }) => ({ contractorType, headcount })), [
    { contractorType: "rta", headcount: 2 },
    { contractorType: "self", headcount: 3 },
  ]);
});
