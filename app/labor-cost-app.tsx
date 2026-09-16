"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, CalendarDays, Download, FileClock, Plus, RotateCcw, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateEstimate,
  dayTypeFromDate,
  DAY_TYPE_LABELS,
  DEFAULT_RATES,
  formatWon,
  INTERNAL_LABOR_RATE,
  WORK_SITES,
  type DayType,
  type LaborRow,
} from "@/lib/labor";

type SavedEstimate = {
  id: string;
  groupId: string;
  version: number;
  projectName: string;
  companyName: string;
  notes: string;
  extraCosts: number;
  internalHeadcount: number;
  internalDays: number;
  internalLaborAmount: number;
  totalAmount: number;
  updatedAt: string;
  createdByEmail: string;
  entries: LaborRow[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function newRow(): LaborRow {
  const date = today();
  return {
    id: crypto.randomUUID(),
    description: "장비 설치 및 셋업",
    workSite: "DS기흥",
    workDate: date,
    dayType: dayTypeFromDate(date),
    headcount: 2,
    days: 1,
  };
}

export function LaborCostApp({ displayName }: { displayName: string }) {
  const [projectName, setProjectName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [extraCosts, setExtraCosts] = useState(0);
  const [internalHeadcount, setInternalHeadcount] = useState(0);
  const [internalDays, setInternalDays] = useState(0);
  const [rows, setRows] = useState<LaborRow[]>([newRow()]);
  const [sourceGroupId, setSourceGroupId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedEstimate[]>([]);
  const [saving, setSaving] = useState(false);

  const result = useMemo(
    () => calculateEstimate(rows, extraCosts, DEFAULT_RATES, internalHeadcount, internalDays),
    [rows, extraCosts, internalHeadcount, internalDays],
  );

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
    void loadSaved();
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
                },
                required: ["description", "workSite", "workDate", "dayType", "headcount", "days"],
              },
            },
            extraCosts: { type: "number", minimum: 0 },
            internalHeadcount: { type: "number", minimum: 0 },
            internalDays: { type: "number", minimum: 0 },
          },
          required: ["rows"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input: unknown) {
          const value = input as {
            rows: Omit<LaborRow, "id">[];
            extraCosts?: number;
            internalHeadcount?: number;
            internalDays?: number;
          };
          const toolRows = value.rows.map((row) => ({ ...row, id: crypto.randomUUID() }));
          const calculation = calculateEstimate(
            toolRows,
            value.extraCosts ?? 0,
            DEFAULT_RATES,
            value.internalHeadcount ?? 0,
            value.internalDays ?? 0,
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
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function resetForm() {
    setProjectName("");
    setCompanyName("");
    setNotes("");
    setExtraCosts(0);
    setInternalHeadcount(0);
    setInternalDays(0);
    setRows([newRow()]);
    setSourceGroupId(null);
  }

  function openEstimate(estimate: SavedEstimate) {
    setProjectName(estimate.projectName);
    setCompanyName(estimate.companyName);
    setNotes(estimate.notes);
    setExtraCosts(estimate.extraCosts);
    setInternalHeadcount(estimate.internalHeadcount ?? 0);
    setInternalDays(estimate.internalDays ?? 0);
    setRows(estimate.entries.map((entry) => ({
      ...entry,
      workSite: entry.workSite || "DS기흥",
      id: crypto.randomUUID(),
    })));
    setSourceGroupId(estimate.groupId);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(`v${estimate.version} 견적을 불러왔습니다.`);
  }

  async function saveEstimate() {
    if (!projectName.trim()) {
      toast.error("공사명을 입력해 주세요.");
      return;
    }
    if (rows.some((row) => !row.description.trim() || row.headcount < 1 || row.days < 0.5)) {
      toast.error("각 작업의 공사명과 인원, 작업일수를 확인해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/estimates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName,
          companyName,
          notes,
          extraCosts,
          internalHeadcount,
          internalDays,
          sourceGroupId,
          entries: rows,
        }),
      });
      const data = (await response.json()) as { error?: string; groupId?: string; version?: number };
      if (!response.ok) throw new Error(data.error || "저장에 실패했습니다.");
      setSourceGroupId(data.groupId ?? null);
      toast.success(`견적 v${data.version}을 저장했습니다.`);
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "견적을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    const lines: (string | number)[][] = [
      ["공사명", projectName || "미입력"],
      ["업체명", companyName || "미입력"],
      [],
      ["작업일", "사업장", "공사명", "구분", "인원", "일수", "공수", "기본노무비", "일반관리비", "공구손료", "요일가산", "합계"],
      ...result.rows.map((row) => [
        row.workDate, row.workSite, row.description, DAY_TYPE_LABELS[row.dayType], row.headcount,
        row.days, row.units, row.baseAmount, row.adminAmount, row.toolAmount,
        row.surchargeAmount, row.totalAmount,
      ]),
      [],
      ["공무기술팀 인원", internalHeadcount],
      ["공무기술팀 작업일수", internalDays],
      ["공무기술팀 노무비", result.internalLaborAmount],
      ["추가비용", extraCosts],
      ["총 노무비", result.grandTotal],
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
      <header className="border-b border-slate-200 bg-[#0c2340] text-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><Calculator className="size-5" /></div>
            <div><p className="text-lg font-semibold tracking-tight">노무비 산정</p><p className="text-xs text-slate-300">공무기술팀 견적 관리</p></div>
          </div>
          <div className="hidden text-right sm:block"><p className="text-sm">{displayName}</p><p className="text-xs text-slate-300">작성자</p></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-medium text-cyan-700">신규 산출</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">공사 노무비 계산</h1></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetForm}><RotateCcw /> 새로 작성</Button>
            <Button variant="outline" onClick={exportExcel}><Download /> 엑셀 내보내기</Button>
            <Button onClick={saveEstimate} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700"><Save /> {saving ? "저장 중" : "견적 저장"}</Button>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">공사 정보</CardTitle></CardHeader>
              <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="projectName">공사명</Label><Input id="projectName" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="예: DS기흥 회의실 AV 개선공사" /></div>
                <div className="space-y-2"><Label htmlFor="companyName">업체명</Label><Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="예: RTA, 일리스, 에스큐브랩" /></div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex-row items-center justify-between border-b border-slate-100">
                <div><CardTitle className="text-base">투입 계획</CardTitle><p className="mt-1 text-sm text-slate-500">직급 구분 없이 모든 인원에 동일한 기준 단가가 적용됩니다.</p></div>
                <Button variant="outline" size="sm" onClick={() => setRows((current) => [...current, newRow()])}><Plus /> 작업 추가</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50"><TableHead className="min-w-[145px] pl-5">작업일</TableHead><TableHead className="min-w-[155px]">사업장</TableHead><TableHead className="min-w-[210px]">공사명</TableHead><TableHead className="min-w-[120px]">구분</TableHead><TableHead className="w-[92px]">인원</TableHead><TableHead className="w-[92px]">일수</TableHead><TableHead className="min-w-[125px] text-right">금액</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-5"><Input type="date" value={row.workDate} onChange={(event) => { const workDate = event.target.value; updateRow(row.id, { workDate, dayType: dayTypeFromDate(workDate) }); }} aria-label="작업일" /></TableCell>
                        <TableCell>
                          <Select value={row.workSite} onValueChange={(value) => updateRow(row.id, { workSite: value })}>
                            <SelectTrigger className="w-full" aria-label="사업장"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {WORK_SITES.map((site) => <SelectItem key={site} value={site}>{site}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input value={row.description} onChange={(event) => updateRow(row.id, { description: event.target.value })} placeholder="공사명 입력" aria-label="공사명" /></TableCell>
                        <TableCell>
                          <Select value={row.dayType} onValueChange={(value) => updateRow(row.id, { dayType: value as DayType })}>
                            <SelectTrigger className="w-full" aria-label="근무 구분"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="weekday">평일</SelectItem><SelectItem value="saturday">토요일</SelectItem><SelectItem value="holiday">휴일</SelectItem></SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" min="1" max="100" value={row.headcount} onChange={(event) => updateRow(row.id, { headcount: Number(event.target.value) })} aria-label="투입 인원" /></TableCell>
                        <TableCell><Input type="number" min="0.5" step="0.5" value={row.days} onChange={(event) => updateRow(row.id, { days: Number(event.target.value) })} aria-label="작업일수" /></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatWon(row.totalAmount)}</TableCell>
                        <TableCell><Button variant="ghost" size="icon-sm" aria-label="작업 삭제" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="text-slate-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-cyan-200 bg-cyan-50/40 shadow-sm">
              <CardHeader className="border-b border-cyan-100">
                <CardTitle className="text-base">공무기술팀 노무비</CardTitle>
                <p className="text-sm text-slate-500">자사 투입 인력은 일반관리비·공구손료·요일 가산 없이 1인 1일 300,000원으로 계산합니다.</p>
              </CardHeader>
              <CardContent className="grid items-end gap-4 pt-5 sm:grid-cols-[1fr_1fr_1.3fr]">
                <div className="space-y-2"><Label htmlFor="internalHeadcount">투입 인원</Label><Input id="internalHeadcount" type="number" min="0" max="100" value={internalHeadcount} onChange={(event) => setInternalHeadcount(Number(event.target.value))} /></div>
                <div className="space-y-2"><Label htmlFor="internalDays">작업일수</Label><Input id="internalDays" type="number" min="0" step="0.5" value={internalDays} onChange={(event) => setInternalDays(Number(event.target.value))} /></div>
                <div className="rounded-xl border border-cyan-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">공무기술팀 합계</p><p className="mt-1 text-xl font-semibold text-cyan-800 tabular-nums">{formatWon(result.internalLaborAmount)}</p></div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">추가 비용 및 비고</CardTitle></CardHeader>
              <CardContent className="grid gap-4 pt-5 md:grid-cols-[240px_1fr]">
                <div className="space-y-2"><Label htmlFor="extraCosts">추가 비용</Label><Input id="extraCosts" type="number" min="0" step="10000" value={extraCosts} onChange={(event) => setExtraCosts(Number(event.target.value))} /><p className="text-xs leading-5 text-slate-500">야간작업, 운반비 등 별도 승인 비용을 입력합니다.</p></div>
                <div className="space-y-2"><Label htmlFor="notes">비고</Label><Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="공정 조건, 일정 변동 가능성, 포함·제외 사항 등을 입력하세요." className="min-h-24" /></div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-5">
            <Card className="overflow-hidden border-0 bg-[#0c2340] text-white shadow-lg">
              <CardHeader className="border-b border-white/10"><div className="flex items-center justify-between"><CardTitle className="text-base text-white">산출 결과</CardTitle><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs text-cyan-300">실시간 계산</span></div></CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="grid grid-cols-2 gap-3"><SummaryMetric icon={<Users />} label="총 공수" value={`${(result.units + result.internalWorkUnits).toLocaleString("ko-KR")}인일`} /><SummaryMetric icon={<CalendarDays />} label="작업 항목" value={`${rows.length}건`} /></div>
                <div className="space-y-2.5 border-t border-white/10 pt-4 text-sm"><SummaryLine label="외부 기본 노무비" value={result.baseAmount} /><SummaryLine label="일반관리비 10%" value={result.adminAmount} /><SummaryLine label="공구손료 3%" value={result.toolAmount} /><SummaryLine label="요일 가산" value={result.surchargeAmount} /><SummaryLine label="공무기술팀 노무비" value={result.internalLaborAmount} /><SummaryLine label="추가 비용" value={result.extraCosts} /></div>
                <div className="border-t border-white/15 pt-4"><p className="text-sm text-slate-300">총 노무비</p><p className="mt-1 text-3xl font-semibold tracking-tight text-cyan-300 tabular-nums">{formatWon(result.grandTotal)}</p></div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">적용 기준</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><RateLine label="외부업체 평일" value={339_000} /><RateLine label="외부업체 토요일" value={389_000} /><RateLine label="외부업체 휴일" value={439_000} /><RateLine label="공무기술팀" value={INTERNAL_LABOR_RATE} /><p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">외부업체는 기본 노무비에 일반관리비와 공구손료를 적용하며, 공무기술팀은 인당 30만원만 계산합니다.</p></CardContent></Card>
          </aside>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2"><FileClock className="size-5 text-cyan-700" /><h2 className="text-lg font-semibold">최근 저장 견적</h2></div>
          {saved.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {saved.slice(0, 9).map((estimate) => (
                <button key={estimate.id} onClick={() => openEstimate(estimate)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{estimate.projectName}</p><p className="mt-1 truncate text-sm text-slate-500">{estimate.companyName || "업체명 미입력"}</p><p className="mt-1 truncate text-xs text-slate-400">{Array.from(new Set(estimate.entries.map((entry) => entry.workSite).filter(Boolean))).join(", ") || "사업장 미입력"}</p></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">v{estimate.version}</span></div>
                  <div className="mt-4 flex items-end justify-between gap-3"><p className="text-lg font-semibold tabular-nums">{formatWon(estimate.totalAmount)}</p><p className="text-xs text-slate-400">{new Date(estimate.updatedAt).toLocaleDateString("ko-KR")}</p></div>
                </button>
              ))}
            </div>
          ) : <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">저장된 견적이 없습니다. 첫 견적을 작성해 저장해 보세요.</div>}
        </section>
      </main>
    </div>
  );
}

function SummaryMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-white/8 p-3"><div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 [&_svg]:size-4">{icon}</div><p className="text-xs text-slate-300">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>;
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-300">{label}</span><span className="tabular-nums">{formatWon(value)}</span></div>;
}

function RateLine({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-600">{label}</span><span className="font-semibold tabular-nums">{formatWon(value)}</span></div>;
}
