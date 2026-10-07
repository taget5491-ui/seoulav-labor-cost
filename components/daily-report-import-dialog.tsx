"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSearch, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { extractDailyReport } from "@/lib/daily-report";
import { CONTRACTOR_TYPE_LABELS, formatWon, type LaborRow } from "@/lib/labor";
import type { DailyReportCandidateAction, DailyReportExtraction } from "@/types/daily-report";

export type DailyReportImportResult = {
  extraction: DailyReportExtraction;
  actions: Record<string, DailyReportCandidateAction>;
};

export function DailyReportImportDialog({ open, onOpenChange, existingRows, onApply, initialFiles }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRows: LaborRow[];
  onApply: (result: DailyReportImportResult) => void;
  initialFiles?: File[];
}) {
  const [extraction, setExtraction] = useState<DailyReportExtraction | null>(null);
  const [actions, setActions] = useState<Record<string, DailyReportCandidateAction>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExtraction(null);
      setActions({});
      setIsDragging(false);
      setError("");
      setFileNames([]);
    }
    onOpenChange(nextOpen);
  }

  const duplicateIds = useMemo(() => new Set(extraction?.laborCandidates.filter((candidate) => existingRows.some((row) =>
    row.workDate === candidate.workDate && row.contractorType === candidate.contractorType && row.contractorName === candidate.contractorName && row.description.trim() === candidate.description.trim(),
  )).map((candidate) => candidate.id) ?? []), [extraction, existingRows]);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    if (files.some((file) => !file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
      setError("PDF 파일만 선택할 수 있습니다.");
      return;
    }
    setAnalyzing(true);
    setError("");
    try {
      const results = await Promise.all(files.map((file) => extractDailyReport(file)));
      const first = results[0];
      const candidates = results.flatMap((result, index) => result.laborCandidates.map((candidate) => ({ ...candidate, id: `${index}-${candidate.id}`, sourceFileName: files[index].name })));
      const result: DailyReportExtraction = {
        ...first,
        projectName: results.find((item) => item.projectName)?.projectName ?? "",
        inferredSiteName: results.find((item) => item.inferredSiteName)?.inferredSiteName ?? "사외",
        reportDate: results.find((item) => item.reportDate)?.reportDate ?? "",
        laborCandidates: candidates,
        warnings: results.flatMap((item, index) => item.warnings.map((warning) => `${files[index].name}: ${warning}`)),
      };
      setFileNames(files.map((file) => file.name));
      setExtraction(result);
      setActions(Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.shift === "night" ? "exclude" : "add"])));
    } catch (cause) {
      console.error("Failed to analyze daily report", cause);
      setError("공사일보를 분석하지 못했습니다. 텍스트가 포함된 PDF인지 확인해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (open && initialFiles?.length) void handleFiles(initialFiles);
  }, [open, initialFiles]);

  function patchExtraction(patch: Partial<DailyReportExtraction>) {
    setExtraction((current) => current ? { ...current, ...patch } : current);
  }

  const applicableCount = extraction?.laborCandidates.filter((candidate) => actions[candidate.id] !== "exclude" && candidate.shift === "day").length ?? 0;
  const sourceDates = useMemo(() => fileNames.map((name) => ({ name, date: extraction?.laborCandidates.find((candidate) => candidate.sourceFileName === name)?.workDate || "" })), [extraction, fileNames]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSearch className="size-5 text-cyan-700" />공사일보 가져오기</DialogTitle>
          <DialogDescription>공사일보 여러 개를 한 번에 끌어다 놓거나 선택하고, 각 파일의 날짜·업체·인원을 검토한 뒤 적용하세요.</DialogDescription>
        </DialogHeader>

        {!extraction && <div
          className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${isDragging ? "border-cyan-600 bg-cyan-100/80" : "border-cyan-300 bg-cyan-50/50"}`}
          onDragEnter={() => { if (!analyzing) setIsDragging(true); }}
          onDragOver={() => { if (!analyzing) setIsDragging(true); }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsDragging(false);
          }}
          onDrop={() => setIsDragging(false)}
        >
          <Input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            disabled={analyzing}
            aria-label="공사일보 PDF 파일을 선택하거나 끌어다 놓기"
            onChange={(event) => { void handleFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }}
          />
          <Upload className="mx-auto size-8 text-cyan-700" />
          <p className="mt-3 font-medium">공사일보 PDF 여러 개를 여기에 끌어다 놓으세요</p>
          <p className="mt-1 text-sm text-slate-500">또는 영역을 눌러 여러 파일을 한 번에 선택하세요.</p>
          <span className="mt-4 inline-flex min-h-10 items-center rounded-md border border-cyan-300 bg-white px-4 text-sm font-medium text-cyan-800 shadow-sm">PDF 여러 개 선택</span>
          {analyzing && <p className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-700"><LoaderCircle className="size-4 animate-spin" />분석 중입니다...</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>}

        {extraction && <div className="space-y-5">
          <div className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>공사명</Label><Input value={extraction.projectName} onChange={(event) => patchExtraction({ projectName: event.target.value })} /></div>
            <div className="space-y-2"><Label>추론 사업장</Label><Input value={extraction.inferredSiteName} onChange={(event) => patchExtraction({ inferredSiteName: event.target.value })} /></div>
            <div className="space-y-2"><Label>공사 시작일</Label><Input type="date" value={extraction.startDate} onChange={(event) => patchExtraction({ startDate: event.target.value })} /></div>
            <div className="space-y-2"><Label>공사 종료일</Label><Input type="date" value={extraction.endDate} onChange={(event) => patchExtraction({ endDate: event.target.value })} /></div>
          </div>

          <div className="grid gap-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 md:grid-cols-2">
            <p className="text-sm font-medium text-cyan-900 md:col-span-2">공사일보별 투입일자</p>
            {sourceDates.map((source) => <div key={source.name} className="space-y-1.5"><Label className="block truncate" title={source.name}>{source.name}</Label><Input type="date" value={source.date} onChange={(event) => patchExtraction({ reportDate: extraction.reportDate || event.target.value, laborCandidates: extraction.laborCandidates.map((candidate) => candidate.sourceFileName === source.name ? { ...candidate, workDate: event.target.value } : candidate) })} /></div>)}
          </div>

          {extraction.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><ul className="space-y-1">{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <Table>
              <TableHeader><TableRow className="bg-slate-50"><TableHead>적용 방식</TableHead><TableHead>투입일자</TableHead><TableHead>구분</TableHead><TableHead>업체</TableHead><TableHead>투입구분</TableHead><TableHead>인원</TableHead><TableHead>자동 노무비</TableHead><TableHead>확인</TableHead></TableRow></TableHeader>
              <TableBody>{extraction.laborCandidates.map((candidate) => <TableRow key={candidate.id}>
                <TableCell>{candidate.contractorType === "self" && candidate.shift === "day" ? <span className="inline-flex min-h-9 items-center rounded-md bg-cyan-50 px-3 text-sm font-medium text-cyan-800">공무기술팀 반영</span> : <Select value={actions[candidate.id] ?? "exclude"} onValueChange={(value) => setActions((current) => ({ ...current, [candidate.id]: value as DailyReportCandidateAction }))} disabled={candidate.shift === "night"}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">새 행 추가</SelectItem><SelectItem value="merge">기존 행과 병합</SelectItem><SelectItem value="exclude">제외</SelectItem></SelectContent></Select>}</TableCell>
                <TableCell className="whitespace-nowrap">{candidate.workDate || "날짜 확인 필요"}</TableCell><TableCell>{candidate.shift === "day" ? "주간" : "야간"}</TableCell>
                <TableCell>{candidate.sourceCompanyName}</TableCell>
                <TableCell>{CONTRACTOR_TYPE_LABELS[candidate.contractorType]}</TableCell>
                <TableCell>{candidate.headcount}명</TableCell>
                <TableCell className="font-medium tabular-nums">{candidate.contractorType === "self" ? "공무기술팀 반영" : formatWon(candidate.contractorQuoteAmount)}</TableCell>
                <TableCell className="text-xs">{candidate.shift === "night" ? <span className="text-amber-700">수동 확인 필요</span> : candidate.contractorType === "self" ? <span className="text-cyan-700">노무비 자동 계산</span> : duplicateIds.has(candidate.id) ? <span className="text-amber-700">동일 행 있음</span> : <span className="text-emerald-700">적용 가능</span>}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>취소</Button>
          {extraction && <Button variant="outline" onClick={() => { setExtraction(null); setActions({}); }}>다른 PDF 선택</Button>}
          <Button disabled={!extraction || applicableCount === 0 || analyzing || extraction.laborCandidates.some((candidate) => actions[candidate.id] !== "exclude" && !candidate.workDate)} onClick={() => extraction && onApply({ extraction, actions })}>투입 계획에 적용 ({applicableCount}건)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
