"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Calculator, CalendarDays, Download, ExternalLink, FileClock, FileInput, FilePenLine, FileText, History, LayoutDashboard, Lock, Paperclip, Plus, Printer, RotateCcw, Save, Search, Trash2, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DailyReportImportDialog, type DailyReportImportResult } from "@/components/daily-report-import-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { extractDirectCostLabor, type LaborExtractionResult } from "@/lib/pdf-labor";
import { candidateDayType, planDailyReportImport } from "@/lib/daily-report";
import {
  calculateEstimate,
  CONTRACTOR_TYPE_LABELS,
  contractorCostPolicy,
  dailyRateForRow,
  dayTypeFromDate,
  DAY_TYPE_LABELS,
  DEFAULT_RATES,
  formatWon,
  INTERNAL_LABOR_RATE,
  requiresCustomDailyRate,
  weekdayLabel,
  WORK_SITES,
  type DayType,
  type ContractorType,
  type LaborRow,
} from "@/lib/labor";

type SavedEstimate = {
  id: string;
  groupId: string;
  version: number;
  projectName: string;
  siteName: string;
  companyName: string;
  managerName: string;
  startDate: string;
  endDate: string;
  status: EstimateStatus;
  archivedAt: string | null;
  notes: string;
  extraCosts: number;
  internalLaborAmount: number;
  quotedLaborAmount: number;
  quoteFileKey: string;
  quoteFileName: string;
  quoteFileSize: number;
  totalAmount: number;
  updatedAt: string;
  createdByEmail: string;
  entries: LaborRow[];
  history: Array<{ id: string; version: number; status: EstimateStatus; totalAmount: number; createdByEmail: string; updatedAt: string }>;
};

type EstimateStatus = "draft" | "review" | "confirmed" | "closed";

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "작성 중",
  review: "검토 요청",
  confirmed: "확정",
  closed: "종료",
};

const STATUS_STYLES: Record<EstimateStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  review: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  closed: "bg-blue-100 text-blue-800",
};

const COST_CHART_CONFIG = {
  quoted: { label: "견적서 노무비", color: "#0891b2" },
  actual: { label: "실제 투입 노무비", color: "#f59e0b" },
} satisfies ChartConfig;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function estimateReferenceDate(estimate: SavedEstimate) {
  return estimate.startDate || estimate.entries.map((entry) => entry.workDate).filter(Boolean).sort()[0] || estimate.updatedAt.slice(0, 10);
}

function newRow(workSite = "DS기흥"): LaborRow {
  const date = today();
  return {
    id: crypto.randomUUID(),
    description: "투입 내역",
    workSite,
    workDate: date,
    dayType: dayTypeFromDate(date),
    headcount: 2,
    days: 1,
    contractorType: "self",
    contractorName: "",
    contractorQuoteAmount: DEFAULT_RATES.baseRate,
    applyOverhead: false,
    additionalCost: 0,
    useBaseRate: true,
    manualLaborAmount: 0,
    baseRate: DEFAULT_RATES.baseRate,
  };
}

function sortRowsByDate(rows: LaborRow[]) {
  return [...rows].sort((a, b) => (a.workDate || "9999-12-31").localeCompare(b.workDate || "9999-12-31"));
}

export function LaborCostApp({ displayName }: { displayName: string }) {
  const [workSite, setWorkSite] = useState("DS기흥");
  const [projectName, setProjectName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<EstimateStatus>("draft");
  const [notes, setNotes] = useState("");
  const [extraCosts, setExtraCosts] = useState(0);
  const [quotedLaborAmount, setQuotedLaborAmount] = useState(0);
  const [quoteFileKey, setQuoteFileKey] = useState("");
  const [quoteFileName, setQuoteFileName] = useState("");
  const [quoteFileSize, setQuoteFileSize] = useState(0);
  const [pendingQuoteFile, setPendingQuoteFile] = useState<File | null>(null);
  const [extractingQuote, setExtractingQuote] = useState(false);
  const [isQuoteDragging, setIsQuoteDragging] = useState(false);
  const [quoteExtraction, setQuoteExtraction] = useState<LaborExtractionResult | null>(null);
  const [rows, setRows] = useState<LaborRow[]>([newRow()]);
  const [sourceGroupId, setSourceGroupId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedEstimate[]>([]);
  const [saving, setSaving] = useState(false);
  const [allowLockedRevision, setAllowLockedRevision] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EstimateStatus>("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [reportMonth, setReportMonth] = useState(today().slice(0, 7));
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const promptedRateRows = useRef(new Set<string>());

  const result = useMemo(
    () => calculateEstimate(rows, extraCosts, DEFAULT_RATES),
    [rows, extraCosts],
  );

  const isLocked = Boolean(sourceGroupId && ["confirmed", "closed"].includes(status) && !allowLockedRevision);
  const filteredSaved = useMemo(() => saved.filter((estimate) => {
    if (estimate.status === "closed") return false;
    if (!includeArchived && estimate.archivedAt) return false;
    if (statusFilter !== "all" && estimate.status !== statusFilter) return false;
    if (siteFilter !== "all" && (estimate.siteName || estimate.entries[0]?.workSite) !== siteFilter) return false;
    const haystack = `${estimate.projectName} ${estimate.siteName} ${estimate.companyName} ${estimate.managerName}`.toLowerCase();
    return haystack.includes(searchTerm.trim().toLowerCase());
  }).sort((a, b) => estimateReferenceDate(a).localeCompare(estimateReferenceDate(b)) || a.projectName.localeCompare(b.projectName, "ko")), [saved, includeArchived, statusFilter, siteFilter, searchTerm]);
  const monthlySaved = useMemo(() => saved.filter((estimate) => !estimate.archivedAt && (estimate.startDate || estimate.updatedAt.slice(0, 7)).startsWith(reportMonth)), [saved, reportMonth]);
  const monthlyTotal = monthlySaved.reduce((sum, estimate) => sum + estimate.totalAmount, 0);
  const monthlySites = new Set(monthlySaved.map((estimate) => estimate.siteName || estimate.entries[0]?.workSite).filter(Boolean)).size;
  const monthlySiteTotals = useMemo(() => summarizeEstimates(monthlySaved, (estimate) => estimate.siteName || estimate.entries[0]?.workSite || "미입력"), [monthlySaved]);
  const monthlyCompanyTotals = useMemo(() => summarizeEstimates(monthlySaved, (estimate) => estimate.companyName || "미입력"), [monthlySaved]);
  const executionRate = quotedLaborAmount > 0 ? (result.grandTotal / quotedLaborAmount) * 100 : 0;
  const remainingLaborAmount = quotedLaborAmount - result.grandTotal;
  const closedCostData = useMemo(() => saved
    .filter((estimate) => !estimate.archivedAt && estimate.status === "closed" && estimate.quotedLaborAmount > 0)
    .sort((a, b) => estimateReferenceDate(b).localeCompare(estimateReferenceDate(a)))
    .slice(0, 3)
    .map((estimate) => ({ name: estimate.projectName.length > 12 ? `${estimate.projectName.slice(0, 12)}…` : estimate.projectName, quoted: estimate.quotedLaborAmount, actual: estimate.totalAmount })), [saved]);

  const loadSaved = useCallback(async () => {
    try {
      const response = await fetch("/api/estimates", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { estimates: SavedEstimate[] };
      setSaved(data.estimates);
    } catch {
      // 계산기는 저장된 목록을 불러오지 못해도 계속 사용할 수 있다.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSaved(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSaved]);

  useEffect(() => {
    const modelContext = (document as unknown as {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void;
      };
    }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    modelContext.registerTool(
      {
        name: "calculate_labor_estimate",
        title: "노무비 계산",
        description: "노무비 기준에 따라 작업 행의 합계를 계산합니다.",
        inputSchema: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  workSite: { type: "string" },
                  workDate: { type: "string" },
                  dayType: { enum: ["weekday", "saturday", "holiday"] },
                  headcount: { type: "number", minimum: 1 },
                  days: { type: "number", minimum: 0.5 },
                  contractorType: { enum: ["self", "rta", "vsent", "coreworker", "direct"] },
                  contractorName: { type: "string" },
                  contractorQuoteAmount: { type: "number", minimum: 0 },
                  applyOverhead: { type: "boolean" },
                  additionalCost: { type: "number", minimum: 0 },
                },
                required: ["description", "workSite", "workDate", "dayType", "headcount", "days", "contractorType", "contractorName", "contractorQuoteAmount"],
              },
            },
            extraCosts: { type: "number", minimum: 0 },
          },
          required: ["rows"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input: unknown) {
          const value = input as {
            rows: Omit<LaborRow, "id">[];
            extraCosts?: number;
          };
          const toolRows = value.rows.map((row) => ({ ...row, id: crypto.randomUUID() }));
          const calculation = calculateEstimate(
            toolRows,
            value.extraCosts ?? 0,
            DEFAULT_RATES,
          );
          return {
            totalAmount: calculation.grandTotal,
            externalWorkUnits: calculation.units,
            internalWorkUnits: calculation.internalWorkUnits,
          };
        },
      },
      { signal: lifecycle.signal },
    );
    return () => lifecycle.abort();
  }, []);

  function updateRow(id: string, patch: Partial<LaborRow>) {
    setRows((current) => sortRowsByDate(current.map((row) => row.id === id ? { ...row, ...patch } : row)));
  }

  function requestRegionalDailyRate(row: LaborRow) {
    const contractorName = row.contractorName.trim();
    if (row.contractorType !== "direct" || row.useBaseRate === false || !requiresCustomDailyRate(workSite, contractorName)) return;
    const promptKey = `${row.id}:${workSite}:${contractorName.toLowerCase()}`;
    if (promptedRateRows.current.has(promptKey)) return;
    promptedRateRows.current.add(promptKey);
    const answer = window.prompt(`${workSite} · ${contractorName} 업체의 인당 일당을 입력해 주세요.`, String(row.baseRate || DEFAULT_RATES.baseRate));
    if (answer === null) return;
    const baseRate = Number(answer.replaceAll(",", "").trim());
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      toast.error("업체 일당을 올바른 숫자로 입력해 주세요.");
      promptedRateRows.current.delete(promptKey);
      return;
    }
    updateRow(row.id, { baseRate: Math.round(baseRate) });
    toast.success(`${contractorName} 일당을 ${formatWon(baseRate)}으로 적용했습니다.`);
  }

  function addRowForDate(sourceRow: LaborRow) {
    setRows((current) => {
      const sourceIndex = current.findIndex((row) => row.id === sourceRow.id);
      const addedRow = {
        ...newRow(sourceRow.workSite || workSite),
        workDate: sourceRow.workDate,
        dayType: sourceRow.dayType,
      };
      if (sourceIndex < 0) return sortRowsByDate([...current, addedRow]);
      const next = [...current];
      next.splice(sourceIndex + 1, 0, addedRow);
      return next;
    });
  }

  function applyDailyReport({ extraction, actions }: DailyReportImportResult) {
    const projectChanged = projectName.trim() && extraction.projectName.trim() && projectName.trim() !== extraction.projectName.trim();
    const siteChanged = workSite && extraction.inferredSiteName && workSite !== extraction.inferredSiteName;
    if ((projectChanged || siteChanged) && !window.confirm("현재 공사 정보와 공사일보의 내용이 다릅니다. 공사일보 정보로 변경하고 선택한 투입 행을 병합할까요?")) return;

    setProjectName(extraction.projectName || projectName);
    setWorkSite(extraction.inferredSiteName || workSite);
    setStartDate(extraction.startDate || startDate);
    setEndDate(extraction.endDate || endDate);
    const importPlan = planDailyReportImport(extraction.laborCandidates, actions);
    setRows((current) => {
      const isInitialPlaceholder = current.length === 1 && !sourceGroupId
        && current[0].contractorType === "self" && [0, DEFAULT_RATES.baseRate].includes(current[0].contractorQuoteAmount)
        && current[0].description === "투입 내역";
      const hasImportedLabor = importPlan.externalCandidates.length > 0 || importPlan.internalCandidates.length > 0;
      const next = isInitialPlaceholder && hasImportedLabor ? [] : current.map((row) => isInitialPlaceholder && extraction.reportDate
        ? { ...row, workDate: extraction.reportDate, dayType: dayTypeFromDate(extraction.reportDate), description: "공사일보 투입" }
        : row);
      for (const candidate of importPlan.externalCandidates) {
        const action = actions[candidate.id] ?? "exclude";
        const matchingIndex = next.findIndex((row) => row.workDate === candidate.workDate && row.contractorType === candidate.contractorType && row.contractorName === candidate.contractorName && row.description.trim() === candidate.description.trim());
        if (action === "merge" && matchingIndex >= 0) {
          next[matchingIndex] = { ...next[matchingIndex], headcount: next[matchingIndex].headcount + candidate.headcount };
          continue;
        }
        next.push({
          id: crypto.randomUUID(), description: candidate.description, workSite: extraction.inferredSiteName || workSite,
          workDate: candidate.workDate, dayType: candidateDayType(candidate), headcount: candidate.headcount, days: candidate.days,
          contractorType: candidate.contractorType, contractorName: candidate.contractorName, contractorQuoteAmount: candidate.contractorQuoteAmount,
          applyOverhead: true, additionalCost: 0,
        });
      }
      for (const candidate of importPlan.internalCandidates) {
        const alreadyAdded = next.some((row) => row.workDate === candidate.workDate && row.contractorType === "self" && row.description.trim() === candidate.description.trim());
        if (alreadyAdded) continue;
        next.push({
          id: crypto.randomUUID(), description: candidate.description, workSite: extraction.inferredSiteName || workSite,
          workDate: candidate.workDate || extraction.reportDate, dayType: dayTypeFromDate(candidate.workDate || extraction.reportDate),
          headcount: candidate.headcount, days: candidate.days, contractorType: "self", contractorName: "", contractorQuoteAmount: DEFAULT_RATES.baseRate,
          applyOverhead: false, additionalCost: 0,
        });
      }
      if (next.length === 0) next.push({ ...newRow(extraction.inferredSiteName || workSite), workDate: extraction.reportDate || today(), dayType: dayTypeFromDate(extraction.reportDate || today()), description: "공사일보 투입" });
      return sortRowsByDate(next);
    });
    setDailyReportOpen(false);
    const internalMessage = importPlan.internalWorkUnits > 0 ? ` 서울영상테크 ${importPlan.internalWorkUnits.toLocaleString("ko-KR")}인일은 공무기술팀 노무비에 포함했습니다.` : "";
    toast.success(`검토한 공사일보 항목을 투입 계획에 적용했습니다.${internalMessage} 아직 저장되지는 않았습니다.`);
  }

  function resetForm() {
    setWorkSite("DS기흥");
    setProjectName("");
    setCompanyName("");
    setManagerName("");
    setStartDate("");
    setEndDate("");
    setStatus("draft");
    setNotes("");
    setExtraCosts(0);
    setQuotedLaborAmount(0);
    setQuoteFileKey("");
    setQuoteFileName("");
    setQuoteFileSize(0);
    setPendingQuoteFile(null);
    setExtractingQuote(false);
    setQuoteExtraction(null);
    setRows([newRow()]);
    setSourceGroupId(null);
    setAllowLockedRevision(false);
  }

  function openEstimate(estimate: SavedEstimate) {
    const savedWorkSite = estimate.siteName || estimate.entries.find((entry) => entry.workSite)?.workSite || "DS기흥";
    setWorkSite(savedWorkSite);
    setProjectName(estimate.projectName);
    setCompanyName(estimate.companyName);
    setManagerName(estimate.managerName || "");
    setStartDate(estimate.startDate || "");
    setEndDate(estimate.endDate || "");
    setStatus(estimate.status || "draft");
    setNotes(estimate.notes);
    setExtraCosts(estimate.extraCosts);
    setQuotedLaborAmount(estimate.quotedLaborAmount ?? 0);
    setQuoteFileKey(estimate.quoteFileKey || "");
    setQuoteFileName(estimate.quoteFileName || "");
    setQuoteFileSize(estimate.quoteFileSize || 0);
    setPendingQuoteFile(null);
    setExtractingQuote(false);
    setQuoteExtraction(null);
    setRows(sortRowsByDate(estimate.entries.map((entry) => ({
      ...entry,
      workSite: savedWorkSite,
      id: crypto.randomUUID(),
      dayType: dayTypeFromDate(entry.workDate),
    }))));
    setSourceGroupId(estimate.groupId);
    setAllowLockedRevision(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(`v${estimate.version} 견적을 불러왔습니다.`);
  }

  function editClosedEstimate(estimate: SavedEstimate) {
    openEstimate(estimate);
    setAllowLockedRevision(true);
    toast.info("종료 상태를 유지한 채 수정할 수 있습니다. 저장하면 새 버전으로 기록됩니다.");
  }

  async function handleQuoteFile(file: File | null) {
    setPendingQuoteFile(file);
    setQuoteExtraction(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("PDF 파일만 첨부할 수 있습니다.");
      setPendingQuoteFile(null);
      return;
    }
    setExtractingQuote(true);
    try {
      const extraction = await extractDirectCostLabor(file);
      setQuoteExtraction(extraction);
      if (extraction.matches.length > 0) {
        setQuotedLaborAmount(extraction.total);
        toast.success(`직접비계 노무비 ${extraction.matches.length}건을 합산했습니다.`);
      } else {
        toast.warning("직접비계의 노무비 금액을 찾지 못했습니다. 스캔 PDF이거나 표 형식이 다른 경우 직접 입력해 주세요.");
      }
    } catch (error) {
      console.error("Failed to extract labor amount", error);
      toast.error("PDF에서 노무비를 읽지 못했습니다. 금액을 직접 입력해 주세요.");
    } finally {
      setExtractingQuote(false);
    }
  }

  async function openVersion(versionId: string) {
    try {
      const response = await fetch(`/api/estimates?id=${encodeURIComponent(versionId)}`, { cache: "no-store" });
      const data = (await response.json()) as { estimate?: SavedEstimate; error?: string };
      if (!response.ok || !data.estimate) throw new Error(data.error || "이력을 불러오지 못했습니다.");
      openEstimate(data.estimate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이력을 불러오지 못했습니다.");
    }
  }

  async function changeArchive(estimate: SavedEstimate) {
    try {
      const response = await fetch("/api/estimates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: estimate.groupId, action: estimate.archivedAt ? "restore" : "archive" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "보관 상태를 변경하지 못했습니다.");
      toast.success(estimate.archivedAt ? "견적을 복원했습니다." : "견적을 보관했습니다.");
      if (sourceGroupId === estimate.groupId && !estimate.archivedAt) resetForm();
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "보관 상태를 변경하지 못했습니다.");
    }
  }

  async function saveEstimate() {
    if (!projectName.trim()) {
      toast.error("공사명을 입력해 주세요.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error("공사 종료일을 확인해 주세요.");
      return;
    }
    if (rows.some((row) => !row.description.trim() || row.headcount < 1 || row.days < 0.5)) {
      toast.error("작업내용과 인원, 작업일수를 확인해 주세요.");
      return;
    }
    if (rows.some((row) => row.contractorType === "direct" && !row.contractorName.trim())) {
      toast.error("직접입력을 선택한 작업의 업체명을 입력해 주세요.");
      return;
    }
    const isClosingProject = status === "closed";

    setSaving(true);
    try {
      let savedQuoteFile = { key: quoteFileKey, name: quoteFileName, size: quoteFileSize };
      if (pendingQuoteFile) {
        const formData = new FormData();
        formData.append("file", pendingQuoteFile);
        const uploadResponse = await fetch("/api/quote-files", { method: "POST", body: formData });
        const uploadData = (await uploadResponse.json()) as { key?: string; name?: string; size?: number; error?: string };
        if (!uploadResponse.ok || !uploadData.key) throw new Error(uploadData.error || "견적서 PDF를 업로드하지 못했습니다.");
        savedQuoteFile = { key: uploadData.key, name: uploadData.name || pendingQuoteFile.name, size: uploadData.size || pendingQuoteFile.size };
        setQuoteFileKey(savedQuoteFile.key);
        setQuoteFileName(savedQuoteFile.name);
        setQuoteFileSize(savedQuoteFile.size);
        setPendingQuoteFile(null);
      }
      const response = await fetch("/api/estimates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName,
          siteName: workSite,
          companyName,
          managerName,
          startDate,
          endDate,
          status,
          notes,
          extraCosts,
          internalHeadcount: 0,
          internalDays: 0,
          quotedLaborAmount,
          quoteFileKey: savedQuoteFile.key,
          quoteFileName: savedQuoteFile.name,
          quoteFileSize: savedQuoteFile.size,
          sourceGroupId,
          allowLockedRevision,
          entries: rows.map((row) => ({ ...row, workSite })),
        }),
      });
      const data = (await response.json()) as { error?: string; groupId?: string; version?: number };
      if (!response.ok) throw new Error(data.error || "저장에 실패했습니다.");
      setSourceGroupId(data.groupId ?? null);
      setAllowLockedRevision(false);
      await loadSaved();
      if (isClosingProject) {
        resetForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast.success(`공사를 종료하고 v${data.version}으로 저장했습니다. 새 공사를 작성할 수 있습니다.`);
      } else {
        toast.success(`견적 v${data.version}을 저장했습니다.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "견적을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    const lines: (string | number)[][] = [
      ["사업장", workSite],
      ["공사명", projectName || "미입력"],
      ["업체명", companyName || "미입력"],
      ["담당자", managerName || "미입력"],
      ["공사기간", startDate && endDate ? `${startDate} ~ ${endDate}` : startDate || endDate || "미입력"],
      ["진행상태", STATUS_LABELS[status]],
      ["견적서상 노무비", quotedLaborAmount],
      ["실제 투입 노무비", result.grandTotal],
      ["노무비 집행률", quotedLaborAmount > 0 ? `${executionRate.toFixed(1)}%` : "미입력"],
      ["잔여 노무비", quotedLaborAmount > 0 ? remainingLaborAmount : "미입력"],
      [],
      ["투입일자", "투입구분", "업체명", "기본 일당", "업체별 가산", "추가 비용", "근무구분", "인원", "일수", "계산 노무비"],
      ...result.rows.map((row) => [
        row.workDate, CONTRACTOR_TYPE_LABELS[row.contractorType],
        row.contractorType === "self" ? "외부업체 없음" : row.contractorName,
        row.baseAmount, contractorCostPolicy(row).label, row.additionalCost, DAY_TYPE_LABELS[row.dayType], row.headcount, row.days, row.totalAmount,
      ]),
      [],
      ["공무기술팀 노무비", result.internalLaborAmount],
      ["외부업체 견적 합계", result.externalContractorAmount],
      ["실제 투입 노무비", result.grandTotal],
      ["추가비용", extraCosts],
      ["총 투입비용", result.totalCost],
      ["비고", notes],
    ];
    const content = `\uFEFF${lines.map((line) => line.map((cell) => String(cell ?? "").replaceAll("\t", " ")).join("\t")).join("\n")}`;
    const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectName || "노무비산출"}_${today()}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("엑셀 파일을 만들었습니다.");
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="no-print border-b border-slate-200 bg-[#0c2340] text-white shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><Calculator className="size-5" /></div>
            <div><p className="text-lg font-semibold tracking-tight">노무비 산정</p><p className="text-xs text-slate-300">공무기술팀 견적 관리</p></div>
          </div>
          <div className="flex items-center gap-3">
            {/* Full document navigation avoids the hosted runtime's broken RSC prefetch path. */}
            <a href="/dashboard" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20"><LayoutDashboard className="size-4" /> 통합 대시보드</a>
            <div className="hidden text-right sm:block"><p className="text-sm">{displayName}</p><p className="text-xs text-slate-300">작성자</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-medium text-cyan-700">신규 산출</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">공사 노무비 계산</h1></div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetForm}><RotateCcw /> 새로 작성</Button>
            <Button variant="outline" onClick={exportExcel}><Download /> 엑셀 내보내기</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> PDF 출력</Button>
            {isLocked && <Button variant="outline" onClick={() => { setAllowLockedRevision(true); if (status === "confirmed") setStatus("draft"); toast.info(status === "closed" ? "종료 상태를 유지한 채 수정할 수 있습니다." : "수정본 작성 상태로 전환했습니다."); }}><Lock /> {status === "closed" ? "종료 공사 수정" : "수정본 만들기"}</Button>}
            <Button onClick={saveEstimate} disabled={saving || extractingQuote || isLocked} className="bg-cyan-600 hover:bg-cyan-700"><Save /> {saving ? "저장 중" : extractingQuote ? "PDF 분석 중" : isLocked ? "확정 잠금" : "견적 저장"}</Button>
          </div>
        </div>

        <div className="print-only mb-6 hidden border-b border-slate-300 pb-4"><h1 className="text-2xl font-semibold">노무비 산출서</h1><p className="mt-1 text-sm text-slate-600">{workSite} · {projectName}</p></div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:gap-8">
          <fieldset disabled={isLocked} className="min-w-0 space-y-5 disabled:opacity-90">
            {isLocked && <div className="no-print rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{status === "closed" ? "종료된 공사입니다. 상단의 ‘종료 공사 수정’을 누르면 종료 상태를 유지하면서 수정할 수 있습니다." : "확정된 견적은 잠금 상태입니다. 변경하려면 상단의 수정본 만들기를 선택하세요."}</div>}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">공사 정보</CardTitle></CardHeader>
              <CardContent className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="workSite">사업장</Label>
                  <Select value={workSite} onValueChange={(value) => { setWorkSite(value); setRows((current) => current.map((row) => ({ ...row, workSite: value }))); }}>
                    <SelectTrigger id="workSite" className="w-full" aria-label="사업장"><SelectValue /></SelectTrigger>
                    <SelectContent>{WORK_SITES.map((site) => <SelectItem key={site} value={site}>{site}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="projectName">공사명</Label><Input id="projectName" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="예: DS기흥 회의실 AV 개선공사" /></div>
                <div className="space-y-2"><Label htmlFor="companyName">업체명</Label><Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="예: RTA, 일리스, 에스큐브랩" /></div>
                <div className="space-y-2"><Label htmlFor="managerName">담당자</Label><Input id="managerName" value={managerName} onChange={(event) => setManagerName(event.target.value)} placeholder="예: 문승균 과장" /></div>
                <div className="space-y-2"><Label htmlFor="startDate">공사 시작일</Label><Input id="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="endDate">공사 종료일</Label><Input id="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="status">진행상태</Label><Select value={status} onValueChange={(value) => setStatus(value as EstimateStatus)}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              </CardContent>
            </Card>

            <Card className="border-cyan-200 bg-cyan-50/30 shadow-sm">
              <CardHeader className="border-b border-cyan-100"><div className="flex items-center gap-2"><FileText className="size-5 text-cyan-700" /><CardTitle className="text-base">견적서 및 노무비 집행현황</CardTitle></div><p className="text-sm text-slate-500">견적서 PDF의 각 시트에서 직접비계 항목의 노무비 금액만 찾아 모두 합산합니다. 인식된 금액은 확인 후 직접 수정할 수 있습니다.</p></CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="quotedLaborAmount">견적서상 노무비 합계</Label><Input id="quotedLaborAmount" type="number" min="0" step="10000" value={quotedLaborAmount} onChange={(event) => setQuotedLaborAmount(Number(event.target.value))} /><p className="text-xs text-slate-500">PDF에서 자동 입력되며 필요하면 직접 수정할 수 있습니다.</p>{quoteExtraction && <div className={`rounded-lg px-3 py-2 text-xs ${quoteExtraction.matches.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{quoteExtraction.matches.length ? `총 ${quoteExtraction.pageCount}페이지 중 직접비계 노무비 ${quoteExtraction.matches.length}건 발견 · ${quoteExtraction.matches.map((match) => `${match.page}페이지 ${formatWon(match.amount)}`).join(" + ")} = ${formatWon(quoteExtraction.total)}` : `총 ${quoteExtraction.pageCount}페이지에서 직접비계 노무비를 찾지 못했습니다.`}</div>}</div>
                  <div className="space-y-2"><Label htmlFor="quoteFile">견적서 PDF 첨부</Label><div className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-colors ${isQuoteDragging ? "border-cyan-600 bg-cyan-100/80" : "border-cyan-300 bg-cyan-50/50"}`} onDragEnter={() => { if (!extractingQuote) setIsQuoteDragging(true); }} onDragOver={() => { if (!extractingQuote) setIsQuoteDragging(true); }} onDragLeave={(event) => { const nextTarget = event.relatedTarget; if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsQuoteDragging(false); }} onDrop={() => setIsQuoteDragging(false)}><Input id="quoteFile" type="file" accept="application/pdf,.pdf" disabled={extractingQuote} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" aria-label="견적서 PDF 파일을 선택하거나 끌어다 놓기" onChange={(event) => { void handleQuoteFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /><FileInput className="mx-auto size-7 text-cyan-700" /><p className="mt-2 text-sm font-medium">견적서 PDF를 끌어다 놓으세요</p><p className="mt-1 text-xs text-slate-500">또는 이 영역을 눌러 파일을 선택하세요.</p></div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">{extractingQuote ? <span className="text-cyan-700">직접비계 노무비를 분석하고 있습니다...</span> : pendingQuoteFile ? <span><Paperclip className="mr-1 inline size-3.5" />저장 예정: {pendingQuoteFile.name}</span> : quoteFileKey ? <a href={`/api/quote-files?key=${encodeURIComponent(quoteFileKey)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-700 hover:underline"><ExternalLink className="size-3.5" />{quoteFileName || "첨부 견적서 열기"}</a> : <span>PDF 파일은 10MB 이하만 첨부할 수 있습니다.</span>}{(pendingQuoteFile || quoteFileKey) && <button type="button" onClick={() => { setPendingQuoteFile(null); setQuoteFileKey(""); setQuoteFileName(""); setQuoteFileSize(0); setQuoteExtraction(null); }} className="text-slate-500 underline">첨부 해제</button>}</div></div>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">업체 노무비 직접입력</p><p className="mt-1 text-xs text-slate-500">업체명과 총 노무비를 입력하면 실제 투입 노무비에 바로 합산됩니다.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, { ...newRow(workSite), description: "업체 노무비 직접입력", contractorType: "direct", contractorName: "", headcount: 1, days: 1, useBaseRate: false, manualLaborAmount: 0 }])}><Plus /> 업체 추가</Button></div>
                  <div className="mt-3 space-y-2">{rows.filter((row) => row.useBaseRate === false).length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">직접 입력한 업체 노무비가 없습니다.</p> : rows.filter((row) => row.useBaseRate === false).map((row) => <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"><Input value={row.contractorName} onChange={(event) => updateRow(row.id, { contractorName: event.target.value })} placeholder="업체명" aria-label="직접입력 업체명" /><Input type="number" min="0" step="10000" value={row.manualLaborAmount ?? 0} onChange={(event) => updateRow(row.id, { manualLaborAmount: Number(event.target.value) })} placeholder="업체 노무비" aria-label="직접입력 업체 노무비" /><Button type="button" variant="ghost" size="icon-sm" aria-label="직접입력 업체 삭제" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="text-slate-500" /></Button></div>)}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <CostMetric label="견적서 노무비" value={quotedLaborAmount > 0 ? formatWon(quotedLaborAmount) : "미입력"} />
                  <CostMetric label="실제 투입 노무비" value={formatWon(result.grandTotal)} />
                  <CostMetric label="집행률" value={quotedLaborAmount > 0 ? `${executionRate.toFixed(1)}%` : "-"} tone={executionRate > 100 ? "danger" : "normal"} />
                  <CostMetric label={remainingLaborAmount < 0 ? "초과 금액" : "잔여 금액"} value={quotedLaborAmount > 0 ? formatWon(Math.abs(remainingLaborAmount)) : "-"} tone={remainingLaborAmount < 0 ? "danger" : "good"} />
                </div>
                {quotedLaborAmount > 0 && <div className="space-y-2"><div className="flex justify-between text-xs text-slate-500"><span>노무비 집행 진행률</span><span>{executionRate.toFixed(1)}%</span></div><Progress value={Math.min(executionRate, 100)} className={executionRate > 100 ? "[&_[data-slot=progress-indicator]]:bg-red-500" : "[&_[data-slot=progress-indicator]]:bg-cyan-600"} /></div>}
                {status === "closed" && quotedLaborAmount > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-3 text-sm font-medium">완료 공사 노무비 비교</p><CostComparisonChart data={[{ name: projectName || "현재 공사", quoted: quotedLaborAmount, actual: result.grandTotal }]} /></div>}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex-row items-center justify-between gap-3 border-b border-slate-100">
                <div><CardTitle className="text-base">투입 계획 및 노무비</CardTitle><p className="mt-1 text-sm text-slate-500">업체를 선택하면 등록된 관리비·공구손료·식대 기준이 자동 적용됩니다. 자체와 직접입력은 필요한 행만 가산을 선택하세요.</p></div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setDailyReportOpen(true)}><FileInput /> 공사일보 PDF 불러오기</Button><Button variant="outline" size="sm" onClick={() => setRows((current) => sortRowsByDate([...current, newRow(workSite)]))}><Plus /> 작업 추가</Button></div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50"><TableHead className="min-w-[215px] pl-5">투입일자</TableHead><TableHead className="min-w-[125px]">투입구분</TableHead><TableHead className="min-w-[125px]">업체명</TableHead><TableHead className="min-w-[125px]">기본 일당</TableHead><TableHead className="min-w-[160px] text-center">업체별 가산</TableHead><TableHead className="min-w-[120px]">추가 비용</TableHead><TableHead className="min-w-[100px]">근무구분</TableHead><TableHead className="min-w-[88px] text-center">인원</TableHead><TableHead className="min-w-[88px] text-center">일수</TableHead><TableHead className="min-w-[120px] text-right">계산 노무비</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-5"><div className="flex items-center gap-2"><Input type="date" value={row.workDate} onChange={(event) => { const workDate = event.target.value; updateRow(row.id, { workDate, dayType: dayTypeFromDate(workDate) }); }} aria-label="투입일자" className={row.dayType === "holiday" ? "text-red-600" : row.dayType === "saturday" ? "text-blue-600" : ""} /><span className={`w-5 shrink-0 text-sm font-semibold ${row.dayType === "holiday" ? "text-red-600" : row.dayType === "saturday" ? "text-blue-600" : "text-slate-500"}`}>{weekdayLabel(row.workDate)}</span><Button type="button" variant="outline" size="icon-sm" onClick={() => addRowForDate(row)} aria-label={`${row.workDate}에 작업행 추가`} title="같은 날짜에 작업행 추가"><Plus className="size-4" /></Button></div></TableCell>
                        <TableCell>
                          <Select value={row.contractorType} onValueChange={(value) => {
                            const contractorType = value as ContractorType;
                            const presetName = contractorType === "rta" ? "RTA" : contractorType === "vsent" ? "VSEnt" : contractorType === "coreworker" ? "코어워커" : "";
                            updateRow(row.id, { contractorType, contractorName: presetName, contractorQuoteAmount: DEFAULT_RATES.baseRate, baseRate: DEFAULT_RATES.baseRate, applyOverhead: ["rta", "vsent", "coreworker"].includes(contractorType) ? true : row.applyOverhead });
                          }}>
                            <SelectTrigger className="w-full" aria-label="투입구분"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(CONTRACTOR_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{row.contractorType === "self" ? <span className="text-sm font-medium text-cyan-700">공무기술팀</span> : row.contractorType === "direct" ? <Input value={row.contractorName} onChange={(event) => updateRow(row.id, { contractorName: event.target.value })} onBlur={() => requestRegionalDailyRate(row)} placeholder="업체명 입력" aria-label="업체명" /> : <span className="text-sm text-slate-700">{row.contractorName}</span>}</TableCell>
                        <TableCell><label className="flex items-center gap-2 text-xs"><Checkbox checked={row.useBaseRate !== false} onCheckedChange={(checked) => updateRow(row.id, { useBaseRate: checked === true })} aria-label="기본일당 적용" /><span>{row.useBaseRate === false ? "제외" : formatWon(dailyRateForRow(row))}</span></label></TableCell>
                        <TableCell><div className="flex justify-center"><Checkbox checked={contractorCostPolicy(row).automatic || row.applyOverhead} disabled={contractorCostPolicy(row).automatic} onCheckedChange={(checked) => updateRow(row.id, { applyOverhead: checked === true })} aria-label="업체별 가산 적용" /></div><p className="mt-1 text-center text-xs leading-4 text-slate-500">{contractorCostPolicy(row).label}</p></TableCell>
                        <TableCell><Input type="number" min="0" step="10000" value={row.additionalCost} onChange={(event) => updateRow(row.id, { additionalCost: Number(event.target.value) })} aria-label="행 추가 비용" /></TableCell>
                        <TableCell>
                          <Select value={row.dayType} onValueChange={(value) => updateRow(row.id, { dayType: value as DayType })}>
                            <SelectTrigger className="w-full" aria-label="근무 구분"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="weekday">평일</SelectItem><SelectItem value="saturday">토요일</SelectItem><SelectItem value="holiday">휴일</SelectItem></SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input className="min-w-[76px] px-2 text-center font-medium" type="number" min="1" max="100" value={row.headcount} onChange={(event) => updateRow(row.id, { headcount: Number(event.target.value) })} aria-label="투입 인원" /></TableCell>
                        <TableCell><Input className="min-w-[76px] px-2 text-center font-medium" type="number" min="0.5" step="0.5" value={row.days} onChange={(event) => updateRow(row.id, { days: Number(event.target.value) })} aria-label="작업일수" /></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatWon(row.totalAmount)}</TableCell>
                        <TableCell><Button variant="ghost" size="icon-sm" aria-label="작업 삭제" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="text-slate-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">추가 비용 및 비고</CardTitle></CardHeader>
              <CardContent className="grid gap-4 pt-5 md:grid-cols-[240px_1fr]">
                <div className="space-y-2"><Label htmlFor="extraCosts">추가 비용</Label><Input id="extraCosts" type="number" min="0" step="10000" value={extraCosts} onChange={(event) => setExtraCosts(Number(event.target.value))} /><p className="text-xs leading-5 text-slate-500">야간작업, 운반비 등 별도 승인 비용을 입력합니다.</p></div>
                <div className="space-y-2"><Label htmlFor="notes">비고</Label><Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="공정 조건, 일정 변동 가능성, 포함·제외 사항 등을 입력하세요." className="min-h-24" /></div>
              </CardContent>
            </Card>
          </fieldset>

          <aside className="min-w-0 space-y-5 xl:sticky xl:top-5">
            <Card className="overflow-hidden border-0 bg-[#0c2340] text-white shadow-lg">
              <CardHeader className="border-b border-white/10"><div className="flex items-center justify-between"><CardTitle className="text-base text-white">산출 결과</CardTitle><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs text-cyan-300">실시간 계산</span></div></CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="grid grid-cols-2 gap-3"><SummaryMetric icon={<Users />} label="총 공수" value={`${result.units.toLocaleString("ko-KR")}인일`} /><SummaryMetric icon={<CalendarDays />} label="작업 항목" value={`${rows.length}건`} /></div>
                <div className="space-y-2.5 border-t border-white/10 pt-4 text-sm"><SummaryLine label="외부업체 노무비" value={result.externalContractorAmount} /><SummaryLine label="공무기술팀 노무비" value={result.internalLaborAmount} /><SummaryLine label="공통 추가 비용" value={result.extraCosts} /></div>
                <div className="border-t border-white/15 pt-4"><p className="text-sm text-slate-300">실제 투입 노무비</p><p className="mt-1 text-2xl font-semibold tracking-tight text-cyan-300 tabular-nums">{formatWon(result.grandTotal)}</p><p className="mt-2 text-xs text-slate-300">추가 비용 포함 총액 {formatWon(result.totalCost)}</p></div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">업체별 집계 기준</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between gap-4"><span className="text-slate-600">기본 일당</span><span className="font-medium tabular-nums">{formatWon(INTERNAL_LABOR_RATE)} / 인일</span></div><div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs leading-5"><p><span className="font-semibold">공무기술팀</span> · 요일·관리비 가산 없이 30만원 고정</p><p><span className="font-semibold">VSEnt</span> · 관리비 15%</p><p><span className="font-semibold">RTA</span> · 관리비 10% + 공구 3%</p><p><span className="font-semibold">코어워커</span> · 관리비 10% + 공구 3% + 식대 1만원/인일</p></div><div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3"><span className="text-slate-600">외부업체 요일 가산</span><span className="font-medium">토 5만원 · 휴일 10만원 / 인일</span></div></CardContent></Card>
          </aside>
        </div>

        <section className="no-print mt-8 space-y-4">
          <div className="flex items-center gap-2"><FileClock className="size-5 text-cyan-700" /><h2 className="text-lg font-semibold">공사 관리</h2></div>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_auto]">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="공사명, 사업장, 업체명, 담당자 검색" className="pl-9" /></div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | EstimateStatus)}><SelectTrigger><SelectValue placeholder="상태 전체" /></SelectTrigger><SelectContent><SelectItem value="all">상태 전체</SelectItem>{Object.entries(STATUS_LABELS).filter(([value]) => value !== "closed").map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}><SelectTrigger><SelectValue placeholder="사업장 전체" /></SelectTrigger><SelectContent><SelectItem value="all">사업장 전체</SelectItem>{WORK_SITES.map((site) => <SelectItem key={site} value={site}>{site}</SelectItem>)}</SelectContent></Select>
              <Input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} aria-label="집계 월" />
              <label className="flex min-h-10 items-center gap-2 whitespace-nowrap text-sm text-slate-600"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} className="size-4 accent-cyan-600" />보관 포함</label>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <ManagementMetric label={`${reportMonth.replace("-", "년 ")}월 노무비`} value={formatWon(monthlyTotal)} />
            <ManagementMetric label="해당 월 공사" value={`${monthlySaved.length}건`} />
            <ManagementMetric label="해당 월 사업장" value={`${monthlySites}개소`} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <AggregateCard title="사업장별 노무비" items={monthlySiteTotals} />
            <AggregateCard title="업체별 노무비" items={monthlyCompanyTotals} />
          </div>

          {closedCostData.length > 0 && <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">종료 공사 견적 대비 실제 노무비</CardTitle><p className="text-sm text-slate-500">기준일이 가장 최근인 종료 공사 3건만 표시합니다. 전체 종료 공사는 통합 대시보드에서 확인하세요.</p></CardHeader><CardContent><CostComparisonChart data={closedCostData} /></CardContent></Card>}

          {filteredSaved.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredSaved.map((estimate) => (
                <div key={estimate.id} className={`rounded-xl border bg-white p-4 shadow-sm ${estimate.archivedAt ? "border-dashed border-slate-300 opacity-70" : "border-slate-200"}`}>
                  <button onClick={() => openEstimate(estimate)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{estimate.projectName}</p><p className="mt-1 truncate text-sm text-slate-500">{estimate.siteName || estimate.entries[0]?.workSite || "사업장 미입력"} · {estimate.companyName || "업체명 미입력"}</p><p className="mt-1 truncate text-xs text-slate-400">{estimate.managerName || "담당자 미입력"}{estimate.startDate ? ` · ${estimate.startDate}${estimate.endDate ? ` ~ ${estimate.endDate}` : ""}` : ""}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-md px-2 py-1 text-xs ${STATUS_STYLES[estimate.status]}`}>{STATUS_LABELS[estimate.status]}</span><span className="text-xs text-slate-400">v{estimate.version}</span></div></div>
                    <div className="mt-4 flex items-end justify-between gap-3"><p className="text-lg font-semibold tabular-nums">{formatWon(estimate.totalAmount)}</p><p className="text-xs text-slate-400">기준일 {estimateReferenceDate(estimate)}</p></div>
                  </button>
                  {estimate.quotedLaborAmount > 0 && <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs"><div><p className="text-slate-400">집행률</p><p className={`mt-0.5 font-medium ${estimate.totalAmount > estimate.quotedLaborAmount ? "text-red-600" : "text-cyan-700"}`}>{((estimate.totalAmount / estimate.quotedLaborAmount) * 100).toFixed(1)}%</p></div><div><p className="text-slate-400">{estimate.totalAmount > estimate.quotedLaborAmount ? "초과 금액" : "잔여 금액"}</p><p className={`mt-0.5 font-medium tabular-nums ${estimate.totalAmount > estimate.quotedLaborAmount ? "text-red-600" : "text-emerald-700"}`}>{formatWon(Math.abs(estimate.quotedLaborAmount - estimate.totalAmount))}</p></div></div>}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex min-w-0 items-center gap-1"><History className="size-3.5 shrink-0 text-slate-400" />{(estimate.history || []).slice(0, 4).map((version) => <button key={version.id} onClick={() => void openVersion(version.id)} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-cyan-100">v{version.version}</button>)}</div>
                    <div className="flex items-center gap-1">{estimate.status === "closed" && !estimate.archivedAt && <Button variant="outline" size="sm" onClick={() => editClosedEstimate(estimate)}><FilePenLine />수정</Button>}<Button variant="ghost" size="sm" onClick={() => void changeArchive(estimate)}><Archive />{estimate.archivedAt ? "복원" : "보관"}</Button></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">조건에 맞는 저장 견적이 없습니다.</div>}
        </section>
      </main>
      <DailyReportImportDialog open={dailyReportOpen} onOpenChange={setDailyReportOpen} existingRows={rows} onApply={applyDailyReport} />
    </div>
  );
}

function SummaryMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-white/8 p-3"><div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 [&_svg]:size-4">{icon}</div><p className="text-xs text-slate-300">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>;
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-300">{label}</span><span className="tabular-nums">{formatWon(value)}</span></div>;
}

function ManagementMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p></div>;
}

function summarizeEstimates(estimates: SavedEstimate[], getKey: (estimate: SavedEstimate) => string) {
  const totals = new Map<string, { total: number; count: number }>();
  for (const estimate of estimates) {
    const key = getKey(estimate);
    const current = totals.get(key) ?? { total: 0, count: 0 };
    totals.set(key, { total: current.total + estimate.totalAmount, count: current.count + 1 });
  }
  return [...totals.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.total - a.total);
}

function AggregateCard({ title, items }: { title: string; items: Array<{ name: string; total: number; count: number }> }) {
  return <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{items.length ? items.slice(0, 5).map((item) => <div key={item.name} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-slate-600">{item.name} <span className="text-xs text-slate-400">{item.count}건</span></span><span className="font-medium tabular-nums">{formatWon(item.total)}</span></div>) : <p className="text-sm text-slate-400">해당 월 자료가 없습니다.</p>}</CardContent></Card>;
}

function CostMetric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "good" | "danger" }) {
  const color = tone === "danger" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-slate-900";
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p></div>;
}

function CostComparisonChart({ data }: { data: Array<{ name: string; quoted: number; actual: number }> }) {
  return <ChartContainer config={COST_CHART_CONFIG} className="h-[280px] w-full aspect-auto">
    <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={data.length > 3 ? -15 : 0} textAnchor={data.length > 3 ? "end" : "middle"} height={data.length > 3 ? 55 : 30} />
      <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(value) => `${Math.round(Number(value) / 10_000).toLocaleString("ko-KR")}만`} />
      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <div className="flex min-w-44 items-center justify-between gap-3"><span className="text-slate-500">{COST_CHART_CONFIG[String(name) as keyof typeof COST_CHART_CONFIG]?.label}</span><span className="font-medium tabular-nums">{formatWon(Number(value))}</span></div>} />} />
      <Bar dataKey="quoted" fill="var(--color-quoted)" radius={[4, 4, 0, 0]} />
      <Bar dataKey="actual" fill="var(--color-actual)" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ChartContainer>;
}
