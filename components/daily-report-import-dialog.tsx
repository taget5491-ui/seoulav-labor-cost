"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSearch, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { extractDailyReport } from "@/lib/daily-report";
import { CONTRACTOR_TYPE_LABELS, type LaborRow } from "@/lib/labor";
import type { DailyReportCandidateAction, DailyReportExtraction } from "@/types/daily-report";

export type DailyReportImportResult = {
  extraction: DailyReportExtraction;
  actions: Record<string, DailyReportCandidateAction>;
};

export function DailyReportImportDialog({ open, onOpenChange, existingRows, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRows: LaborRow[];
  onApply: (result: DailyReportImportResult) => void;
}) {
  const [extraction, setExtraction] = useState<DailyReportExtraction | null>(null);
  const [actions, setActions] = useState<Record<string, DailyReportCandidateAction>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExtraction(null);
      setActions({});
      setError("");
    }
    onOpenChange(nextOpen);
  }

  const duplicateIds = useMemo(() => new Set(extraction?.laborCandidates.filter((candidate) => existingRows.some((row) =>
    row.workDate === candidate.workDate && row.contractorType === candidate.contractorType && row.contractorName === candidate.contractorName && row.description.trim() === candidate.description.trim(),
  )).map((candidate) => candidate.id) ?? []), [extraction, existingRows]);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("PDF 파일만 선택할 수 있습니다.");
      return;
    }
    setAnalyzing(true);
    setError("");
    try {
      const result = await extractDailyReport(file);
      setExtraction(result);
      setActions(Object.fromEntries(result.laborCandidates.map((candidate) => [candidate.id, candidate.shift === "night" ? "exclude" : "add"])));
    } catch (cause) {
      console.error("Failed to analyze daily report", cause);
      setError("공사일보를 분석하지 못했습니다. 텍스트가 포함된 PDF인지 확인해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  }

  function patchExtraction(patch: Partial<DailyReportExtraction>) {
    setExtraction((current) => current ? { ...current, ...patch } : current);
  }

  const applicableCount = extraction?.laborCandidates.filter((candidate) => actions[candidate.id] !== "exclude" && candidate.shift === "day").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSearch className="size-5 text-cyan-700" />공사일보 가져오기</DialogTitle>
          <DialogDescription>PDF를 분석한 결과를 검토하고 필요한 항목만 투입 계획에 적용하세요. 분석만으로는 저장되지 않습니다.</DialogDescription>
        </DialogHeader>

        {!extraction && <div className="rounded-xl border border-dashed border-cyan-300 bg-cyan-50/50 p-8 text-center">
          <Upload className="mx-auto size-8 text-cyan-700" />
          <p className="mt-3 font-medium">공사일보 PDF 선택</p>
          <p className="mt-1 text-sm text-slate-500">텍스트가 포함된 첫 페이지를 기준으로 분석합니다.</p>
          <Input type="file" accept="application/pdf,.pdf" className="mx-auto mt-4 max-w-md" disabled={analyzing} onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
          {analyzing && <p className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-700"><LoaderCircle className="size-4 animate-spin" />분석 중입니다...</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>}

        {extraction && <div className="space-y-5">
          <div className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>공사명</Label><Input value={extraction.projectName} onChange={(event) => patchExtraction({ projectName: event.target.value })} /></div>
            <div className="space-y-2"><Label>추론 사업장</Label><Input value={extraction.inferredSiteName} onChange={(event) => patchExtraction({ inferredSiteName: event.target.value })} /></div>
            <div className="space-y-2"><Label>작성일자</Label><Input type="date" value={extraction.reportDate} onChange={(event) => patchExtraction({ reportDate: event.target.value, laborCandidates: extraction.laborCandidates.map((candidate) => ({ ...candidate, workDate: event.target.value })) })} /></div>
            <div className="space-y-2"><Label>공사 시작일</Label><Input type="date" value={extraction.startDate} onChange={(event) => patchExtraction({ startDate: event.target.value })} /></div>
            <div className="space-y-2"><Label>공사 종료일</Label><Input type="date" value={extraction.endDate} onChange={(event) => patchExtraction({ endDate: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>금일 작업 내용</Label><Textarea className="min-h-32" value={extraction.todayWork} onChange={(event) => patchExtraction({ todayWork: event.target.value, laborCandidates: extraction.laborCandidates.map((candidate) => ({ ...candidate, description: event.target.value })) })} /></div>
            {extraction.nextWork && <div className="space-y-2 md:col-span-2"><Label>다음 작업 현황 · 참고</Label><Textarea readOnly className="min-h-20 bg-slate-50" value={extraction.nextWork} /></div>}
          </div>

          {extraction.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><ul className="space-y-1">{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <Table>
              <TableHeader><TableRow className="bg-slate-50"><TableHead>적용 방식</TableHead><TableHead>구분</TableHead><TableHead>업체</TableHead><TableHead>투입구분</TableHead><TableHead>인원</TableHead><TableHead>확인</TableHead></TableRow></TableHeader>
              <TableBody>{extraction.laborCandidates.map((candidate) => <TableRow key={candidate.id}>
                <TableCell>{candidate.contractorType === "self" && candidate.shift === "day" ? <span className="inline-flex min-h-9 items-center rounded-md bg-cyan-50 px-3 text-sm font-medium text-cyan-800">공무기술팀 반영</span> : <Select value={actions[candidate.id] ?? "exclude"} onValueChange={(value) => setActions((current) => ({ ...current, [candidate.id]: value as DailyReportCandidateAction }))} disabled={candidate.shift === "night"}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">새 행 추가</SelectItem><SelectItem value="merge">기존 행과 병합</SelectItem><SelectItem value="exclude">제외</SelectItem></SelectContent></Select>}</TableCell>
                <TableCell>{candidate.shift === "day" ? "주간" : "야간"}</TableCell>
                <TableCell>{candidate.sourceCompanyName}</TableCell>
                <TableCell>{CONTRACTOR_TYPE_LABELS[candidate.contractorType]}</TableCell>
                <TableCell>{candidate.headcount}명</TableCell>
                <TableCell className="text-xs">{candidate.shift === "night" ? <span className="text-amber-700">수동 확인 필요</span> : candidate.contractorType === "self" ? <span className="text-cyan-700">노무비 자동 계산</span> : duplicateIds.has(candidate.id) ? <span className="text-amber-700">동일 행 있음</span> : <span className="text-emerald-700">적용 가능</span>}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>취소</Button>
          {extraction && <Button variant="outline" onClick={() => { setExtraction(null); setActions({}); }}>다른 PDF 선택</Button>}
          <Button disabled={!extraction || applicableCount === 0 || analyzing || !extraction.reportDate || !extraction.todayWork.trim()} onClick={() => extraction && onApply({ extraction, actions })}>투입 계획에 적용 ({applicableCount}건)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
