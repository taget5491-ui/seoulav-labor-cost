import type { ContractorType } from "@/lib/labor";

export type PositionedPdfText = {
  text: string;
  x: number;
  y: number;
  width: number;
};

export type DailyReportLaborCandidate = {
  id: string;
  workDate: string;
  description: string;
  shift: "day" | "night";
  sourceCompanyName: string;
  contractorType: ContractorType;
  contractorName: string;
  headcount: number;
  days: number;
  contractorQuoteAmount: number;
};

export type DailyReportExtraction = {
  projectName: string;
  inferredSiteName: string;
  startDate: string;
  endDate: string;
  reportDate: string;
  primaryWork: string;
  todayWork: string;
  nextWork: string;
  laborCandidates: DailyReportLaborCandidate[];
  warnings: string[];
};

export type DailyReportCandidateAction = "add" | "merge" | "exclude";
