import { dayTypeFromDate, DEFAULT_RATES, type ContractorType } from "./labor.ts";
import type { DailyReportCandidateAction, DailyReportExtraction, DailyReportLaborCandidate, PositionedPdfText } from "../types/daily-report.ts";

type TextLine = { y: number; items: PositionedPdfText[]; text: string };

function compact(value: string) {
  return value.replace(/\s+/g, "").replace(/[□■▪]/g, "");
}

function groupLines(items: PositionedPdfText[]) {
  const lines: TextLine[] = [];
  for (const item of [...items].filter((entry) => entry.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item], text: "" });
  }
  return lines.map((line) => {
    const sorted = line.items.sort((a, b) => a.x - b.x);
    return { ...line, items: sorted, text: sorted.map((item) => item.text.trim()).filter(Boolean).join(" ") };
  });
}

function parseIsoDate(value: string) {
  const iso = value.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!iso) return "";
  return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
}

function parseFilenameDate(filename: string) {
  const match = filename.match(/(?:^|\D)(20\d{2}|\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (!match) return "";
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const date = `${year}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function inferSite(projectName: string) {
  const normalized = compact(projectName).toUpperCase();
  const rules: Array<[RegExp, string]> = [
    [/DSR/, "DSR"], [/DS기흥|기흥/, "DS기흥"], [/DS화성|화성/, "DS화성"], [/DS평택|평택/, "DS평택"],
    [/DS온양|온양/, "DS온양"], [/DS천안/, "DS천안"], [/SAIT/, "SAIT"], [/UNIVERSE/, "The UniverSE"],
    [/동탄DS큐브/, "동탄DS큐브"], [/DS에듀센터동탄/, "DS에듀센터 동탄"], [/DS에듀센터탕정/, "DS에듀센터 탕정"],
    [/DX인재개발원/, "DX인재개발원"], [/SDI기흥/, "SDI기흥"], [/SDI천안/, "SDI천안"], [/SDC/, "SDC"],
  ];
  return rules.find(([pattern]) => pattern.test(normalized))?.[1] ?? "사외";
}

function splitCompanyItem(item: PositionedPdfText) {
  const normalized = compact(item.text);
  const known = [...normalized.matchAll(/서울영상테크|RTA|VSENT|코어워커/gi)];
  if (known.length <= 1) return [item];
  const segmentWidth = Math.max(item.width / known.length, 1);
  return known.map((match, index) => ({ text: match[0], x: item.x + segmentWidth * index, y: item.y, width: segmentWidth }));
}

export function normalizeCompany(source: string): { contractorType: ContractorType; contractorName: string } {
  const normalized = compact(source).replace(/\(주\)|㈜/g, "").toLowerCase();
  if (/서울영상테크/.test(normalized)) return { contractorType: "self", contractorName: "" };
  if (normalized === "rta") return { contractorType: "rta", contractorName: "RTA" };
  if (normalized === "vsent") return { contractorType: "vsent", contractorName: "VSEnt" };
  if (/코어워커/.test(normalized)) return { contractorType: "coreworker", contractorName: "코어워커" };
  return { contractorType: "direct", contractorName: source.trim() };
}

function sectionText(lines: TextLine[], header: string, lowerY: number, side: "left" | "right", pageWidth: number) {
  const headerLine = lines.find((line) => compact(line.text).includes(compact(header)));
  if (!headerLine) return "";
  const middle = pageWidth / 2;
  return lines
    .filter((line) => line.y < headerLine.y - 2 && line.y > lowerY + 2)
    .map((line) => line.items.filter((item) => side === "left" ? item.x >= pageWidth * 0.25 && item.x < middle : item.x >= middle).map((item) => item.text.trim()).filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .join("\n");
}

function extractLaborCandidates(lines: TextLine[], pageWidth: number, reportDate: string, description: string) {
  const midpoint = pageWidth / 2;
  const workHeaderY = lines.find((line) => compact(line.text).includes("금일작업현황"))?.y ?? Number.POSITIVE_INFINITY;
  const companyRows = lines.filter((line) => line.y < workHeaderY && compact(line.text).includes("업체명"));
  const candidates: DailyReportLaborCandidate[] = [];

  for (const [shiftIndex, companyRow] of companyRows.slice(0, 2).entries()) {
    const shift = shiftIndex === 0 ? "day" : "night";
    const companyLabel = companyRow.items.find((item) => compact(item.text).includes("업체명"));
    const labelRight = companyLabel ? companyLabel.x + Math.max(companyLabel.width, 28) : pageWidth * 0.2;
    const companies = companyRow.items.filter((item) => item.x >= labelRight - 2 && item.x < midpoint && !compact(item.text).includes("업체명")).flatMap(splitCompanyItem);
    if (!companies.length) continue;
    const countRow = lines.filter((line) => line.y < companyRow.y - 2 && line.y > companyRow.y - 18).sort((a, b) => b.y - a.y)[0];
    const counts = countRow?.items.flatMap((item) => {
      if (item.x < labelRight - 2 || item.x >= midpoint) return [];
      const match = compact(item.text).match(/^(\d+(?:\.\d+)?)(?:명|인)?$/);
      return match ? [{ ...item, numericValue: Number(match[1]) }] : [];
    }) ?? [];
    for (const company of companies) {
      const count = counts.reduce<{ distance: number; value: number } | null>((best, item) => {
        const distance = Math.abs(item.x - company.x);
        return !best || distance < best.distance ? { distance, value: item.numericValue } : best;
      }, null);
      if (!count?.value) continue;
      const normalized = normalizeCompany(company.text);
      const contractorQuoteAmount = DEFAULT_RATES.baseRate;
      candidates.push({
        id: `${shift}-${company.x}-${company.y}`,
        workDate: reportDate,
        description,
        shift,
        sourceCompanyName: company.text.trim(),
        ...normalized,
        headcount: count.value,
        days: 1,
        contractorQuoteAmount,
      });
    }
  }
  return candidates;
}

export function parseDailyReport(items: PositionedPdfText[], pageWidth: number): DailyReportExtraction {
  const lines = groupLines(items);
  const warnings: string[] = [];
  const projectLine = lines.find((line) => compact(line.text).includes("공사명"));
  let projectName = projectLine ? projectLine.items.filter((item) => item.x >= pageWidth * 0.25 && item.x < pageWidth * 0.62).map((item) => item.text.trim()).filter(Boolean).join(" ") : "";
  projectName = projectName.replace(/전체\s*공정률.*$/u, "").trim();

  const periodLine = lines.find((line) => compact(line.text).includes("공사기간"));
  const periodDates = periodLine?.text.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/g) ?? [];
  const startDate = periodDates[0] ? parseIsoDate(periodDates[0]) : "";
  const endDate = periodDates[1] ? parseIsoDate(periodDates[1]) : "";
  const reportLine = lines.find((line) => compact(line.text).includes("작성일자"));
  const reportLabel = reportLine?.items.find((item) => compact(item.text).includes("작성일자"));
  const reportDateText = reportLine && reportLabel
    ? [reportLabel.text.replace(/^.*?작성\s*일자/u, ""), ...reportLine.items.filter((item) => item.x > reportLabel.x).map((item) => item.text)].join(" ")
    : reportLine?.text.replace(/^.*?작성\s*일자/u, "") ?? "";
  const reportDate = parseIsoDate(reportDateText);

  const primaryLine = lines.find((line) => compact(line.text).includes("주요작업내용"));
  const primaryWork = primaryLine ? primaryLine.items.filter((item) => item.x >= pageWidth * 0.25).map((item) => item.text.trim()).filter(Boolean).join(" ") : "";
  const workHeaderY = lines.find((line) => compact(line.text).includes("금일작업현황"))?.y ?? Number.POSITIVE_INFINITY;
  const firstCompanyRowY = lines.filter((line) => line.y < workHeaderY && compact(line.text).includes("업체명")).sort((a, b) => b.y - a.y)[0]?.y ?? -Infinity;
  const todayWork = sectionText(lines, "금일 작업 현황", firstCompanyRowY, "left", pageWidth) || primaryWork;
  const nextWork = sectionText(lines, "다음 작업 현황", firstCompanyRowY, "right", pageWidth);
  const laborCandidates = extractLaborCandidates(lines, pageWidth, reportDate, "공사일보 투입");

  if (!projectName) warnings.push("공사명을 찾지 못했습니다.");
  if (!reportDate) warnings.push("작성일자를 찾지 못했습니다.");
  if (!laborCandidates.length) warnings.push("주간 투입 업체와 인원을 찾지 못했습니다.");
  if (laborCandidates.some((candidate) => candidate.shift === "night")) warnings.push("야간 투입 인원이 있습니다. 현재 모델에는 야간 구분이 없어 자동 적용할 수 없습니다.");

  return {
    projectName,
    inferredSiteName: inferSite(projectName),
    startDate,
    endDate,
    reportDate,
    primaryWork,
    todayWork,
    nextWork,
    laborCandidates,
    warnings,
  };
}

export async function extractDailyReport(file: File): Promise<DailyReportExtraction> {
  const { default: pdfWorkerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PositionedPdfText[] = content.items.flatMap((raw) => {
      if (!("str" in raw) || !("transform" in raw)) return [];
      const text = String(raw.str).trim();
      if (!text) return [];
      return [{ text, x: Number(raw.transform[4]), y: Number(raw.transform[5]), width: Number("width" in raw ? raw.width : 0) }];
    });
    page.cleanup();
    const result = parseDailyReport(items, viewport.width);
    if (!result.reportDate) {
      const fallbackDate = parseFilenameDate(file.name);
      if (fallbackDate) {
        result.reportDate = fallbackDate;
        result.laborCandidates = result.laborCandidates.map((candidate) => ({ ...candidate, workDate: fallbackDate }));
        result.warnings = result.warnings.filter((warning) => warning !== "작성일자를 찾지 못했습니다.");
        result.warnings.push("PDF 본문에서 작성일자를 찾지 못해 파일명의 날짜를 적용했습니다.");
      }
    }
    result.laborCandidates = result.laborCandidates.map((candidate) => ({ ...candidate, sourceFileName: file.name }));
    if (document.numPages > 1) result.warnings.push(`첫 페이지 기준으로 분석했습니다. 전체 ${document.numPages}페이지입니다.`);
    return result;
  } finally {
    await loadingTask.destroy();
  }
}

export function candidateDayType(candidate: DailyReportLaborCandidate) {
  return dayTypeFromDate(candidate.workDate);
}

export function reportDateRange(dates: string[]) {
  const sorted = [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  return { startDate: sorted[0] ?? "", endDate: sorted.at(-1) ?? "" };
}

export function planDailyReportImport(
  candidates: DailyReportLaborCandidate[],
  actions: Record<string, DailyReportCandidateAction>,
) {
  const selected = candidates.filter((candidate) => candidate.shift === "day" && actions[candidate.id] !== "exclude");
  return {
    externalCandidates: selected.filter((candidate) => candidate.contractorType !== "self").map((candidate) => ({
      ...candidate,
      contractorQuoteAmount: DEFAULT_RATES.baseRate,
    })),
    internalCandidates: selected.filter((candidate) => candidate.contractorType === "self"),
    internalWorkUnits: selected.filter((candidate) => candidate.contractorType === "self").reduce((sum, candidate) => sum + candidate.headcount * candidate.days, 0),
  };
}
