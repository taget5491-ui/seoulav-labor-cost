"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building2, CalendarRange, Download, FileText, Printer, RotateCcw, Search, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatWon, type LaborRow } from "@/lib/labor";

type Status = "draft" | "review" | "confirmed" | "closed";
type Estimate = {
  id: string; projectName: string; siteName: string; companyName: string; managerName: string;
  startDate: string; endDate: string; status: Status; archivedAt: string | null;
  internalHeadcount: number; internalLaborAmount: number; quotedLaborAmount: number;
  totalAmount: number; updatedAt: string; entries: LaborRow[];
};

const STATUS_LABELS: Record<Status, string> = { draft: "작성 중", review: "검토 요청", confirmed: "확정", closed: "종료" };
const STATUS_STYLES: Record<Status, string> = { draft: "bg-slate-100 text-slate-700", review: "bg-amber-100 text-amber-800", confirmed: "bg-emerald-100 text-emerald-800", closed: "bg-blue-100 text-blue-800" };
const TREND_CONFIG = { quoted: { label: "견적 노무비", color: "#0891b2" }, actual: { label: "실제 노무비", color: "#f59e0b" } } satisfies ChartConfig;
const TOTAL_CONFIG = { total: { label: "노무비", color: "#0891b2" } } satisfies ChartConfig;
const ALL = "__all__";

const amountTick = (value: number) => value >= 100_000_000 ? `${(value / 100_000_000).toFixed(1)}억` : value >= 10_000 ? `${Math.round(value / 10_000)}만` : String(value);
const escapeCell = (value: unknown) => String(value ?? "").replaceAll("\t", " ").replaceAll("\r", " ").replaceAll("\n", " ");
const effectiveDate = (item: Estimate) => item.startDate || item.updatedAt.slice(0, 10);

export function LaborDashboard({ displayName, initialEstimates }: { displayName: string; initialEstimates: Estimate[] }) {
  const items = initialEstimates;
  const [search, setSearch] = useState("");
  const [site, setSite] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const sites = useMemo(() => [...new Set(items.map((item) => item.siteName).filter(Boolean))].sort(), [items]);
  const companies = useMemo(() => [...new Set(items.flatMap((item) => [item.companyName, ...item.entries.filter((row) => row.contractorType !== "self").map((row) => row.contractorName)]).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (item.archivedAt) return false;
    const date = effectiveDate(item);
    const text = `${item.projectName} ${item.siteName} ${item.companyName} ${item.managerName} ${item.entries.map((row) => row.contractorName).join(" ")}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (site === ALL || item.siteName === site)
      && (company === ALL || item.companyName === company || item.entries.some((row) => row.contractorName === company))
      && (status === ALL || item.status === status) && (!from || date >= from) && (!to || date <= to);
  }), [items, search, site, company, status, from, to]);

  const summaries = useMemo(() => {
    const quoted = filtered.reduce((sum, item) => sum + Number(item.quotedLaborAmount || 0), 0);
    const actual = filtered.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const internal = filtered.reduce((sum, item) => sum + Number(item.internalLaborAmount || 0), 0);
    const headcount = filtered.reduce((sum, item) => sum + item.entries.reduce((entrySum, row) => entrySum + Number(row.headcount || 0), 0), 0);
    return { quoted, actual, internal, headcount, rate: quoted ? (actual / quoted) * 100 : 0 };
  }, [filtered]);

  const siteData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((item) => map.set(item.siteName || "미지정", (map.get(item.siteName || "미지정") ?? 0) + Number(item.totalAmount || 0)));
    return [...map].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filtered]);
  const companyData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((item) => {
      item.entries.filter((row) => row.contractorType !== "self").forEach((row) => {
        const name = row.contractorName || item.companyName || "업체 미지정";
        map.set(name, (map.get(name) ?? 0) + Number(row.contractorQuoteAmount || 0));
      });
    });
    return [...map].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filtered]);
  const monthlyData = useMemo(() => {
    const map = new Map<string, { quoted: number; actual: number }>();
    filtered.forEach((item) => {
      const month = effectiveDate(item).slice(0, 7) || "날짜 미지정";
      const current = map.get(month) ?? { quoted: 0, actual: 0 };
      current.quoted += Number(item.quotedLaborAmount || 0); current.actual += Number(item.totalAmount || 0); map.set(month, current);
    });
    return [...map].map(([month, value]) => ({ month, ...value })).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const resetFilters = () => { setSearch(""); setSite(ALL); setCompany(ALL); setStatus(ALL); setFrom(""); setTo(""); };
  const exportReport = () => {
    const rows: unknown[][] = [
      ["서울영상테크 노무비 통합 보고서"], ["생성일", new Date().toLocaleString("ko-KR")],
      ["필터", `기간 ${from || "전체"}~${to || "전체"} / 사업장 ${site === ALL ? "전체" : site} / 업체 ${company === ALL ? "전체" : company} / 상태 ${status === ALL ? "전체" : STATUS_LABELS[status as Status]}`], [],
      ["요약"], ["프로젝트", filtered.length, "실제 노무비", summaries.actual, "견적 노무비", summaries.quoted, "집행률", `${summaries.rate.toFixed(1)}%`, "공무기술팀", summaries.internal], [],
      ["프로젝트별 상세"], ["기준일", "프로젝트", "사업장", "업체", "상태", "담당자", "투입 인원", "견적 노무비", "실제 노무비", "공무기술팀 노무비"],
      ...filtered.map((item) => [effectiveDate(item), item.projectName, item.siteName, item.companyName, STATUS_LABELS[item.status], item.managerName, item.entries.reduce((sum, row) => sum + Number(row.headcount || 0), 0), item.quotedLaborAmount, item.totalAmount, item.internalLaborAmount]),
      [], ["사업장별 요약"], ["사업장", "노무비"], ...siteData.map((row) => [row.name, row.total]),
      [], ["업체별 요약"], ["업체", "노무비"], ...companyData.map((row) => [row.name, row.total]),
      [], ["월별 추이"], ["월", "견적 노무비", "실제 노무비"], ...monthlyData.map((row) => [row.month, row.quoted, row.actual]),
    ];
    const content = "\ufeff" + rows.map((row) => row.map(escapeCell).join("\t")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `노무비_통합보고서_${new Date().toISOString().slice(0, 10)}.xls`; anchor.click(); URL.revokeObjectURL(url);
    toast.success("엑셀 보고서를 만들었습니다.");
  };

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <header className="no-print border-b border-slate-200 bg-[#0c2340] text-white shadow-sm">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><BarChart3 className="size-5" /></div><div><p className="text-lg font-semibold">통합 대시보드</p><p className="text-xs text-slate-300">노무비 현황 및 보고</p></div></div>
        <div className="flex items-center gap-3"><a href="/" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20"><ArrowLeft className="size-4" /> 산정 화면</a><div className="hidden text-right sm:block"><p className="text-sm">{displayName}</p><p className="text-xs text-slate-300">사용자</p></div></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-cyan-700">MANAGEMENT OVERVIEW</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">노무비 운영 현황</h1><p className="mt-1 text-sm text-slate-500">저장된 프로젝트를 원하는 기준으로 필터링하고 보고서로 내보낼 수 있습니다.</p></div><div className="no-print flex gap-2"><Button variant="outline" onClick={exportReport} disabled={!filtered.length}><Download /> 엑셀 보고서</Button><Button variant="outline" onClick={() => window.print()}><Printer /> PDF / 인쇄</Button></div></div>
      <div className="print-only mb-6 hidden border-b border-slate-300 pb-4"><h1 className="text-2xl font-semibold">서울영상테크 노무비 통합 보고서</h1><p className="mt-1 text-sm text-slate-600">출력일 {new Date().toLocaleDateString("ko-KR")} · {filtered.length}개 프로젝트</p></div>
      <Card className="no-print mb-5 border-slate-200 shadow-sm"><CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_1fr_1fr_auto]">
        <div className="space-y-1.5"><Label>검색</Label><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400"/><Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="프로젝트, 업체, 담당자" /></div></div>
        <div className="space-y-1.5"><Label>사업장</Label><Select value={site} onValueChange={setSite}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 사업장</SelectItem>{sites.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>업체</Label><Select value={company} onValueChange={setCompany}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 업체</SelectItem>{companies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>상태</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 상태</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>기간</Label><div className="flex gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일"/><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일"/></div></div>
        <div className="flex items-end"><Button variant="outline" onClick={resetFilters}><RotateCcw /> 초기화</Button></div>
      </CardContent></Card>
      <>
        <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "프로젝트", value: `${filtered.length}건`, sub: `전체 ${items.filter((item) => !item.archivedAt).length}건`, icon: FileText, tone: "text-cyan-700 bg-cyan-50" },
            { label: "실제 노무비", value: formatWon(summaries.actual), sub: "필터 적용 합계", icon: BarChart3, tone: "text-amber-700 bg-amber-50" },
            { label: "견적 노무비", value: formatWon(summaries.quoted), sub: "등록 견적 합계", icon: CalendarRange, tone: "text-blue-700 bg-blue-50" },
            { label: "집행률", value: `${summaries.rate.toFixed(1)}%`, sub: summaries.rate > 100 ? "견적 초과" : "견적 대비 실제", icon: Building2, tone: summaries.rate > 100 ? "text-red-700 bg-red-50" : "text-emerald-700 bg-emerald-50" },
            { label: "공무기술팀", value: formatWon(summaries.internal), sub: `총 투입 ${summaries.headcount.toLocaleString("ko-KR")}명`, icon: Users, tone: "text-violet-700 bg-violet-50" },
          ].map(({ label, value, sub, icon: Icon, tone }) => <Card key={label} className="border-slate-200 shadow-sm"><CardContent className="flex items-start justify-between pt-6"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="size-5"/></div></CardContent></Card>)}
        </section>
        <section className="mb-5 grid gap-5 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">월별 견적 대비 실제 노무비</CardTitle></CardHeader><CardContent>{monthlyData.length ? <ChartContainer config={TREND_CONFIG} className="h-[310px] w-full aspect-auto"><LineChart data={monthlyData} margin={{ left: 8, right: 16 }}><CartesianGrid vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickFormatter={amountTick} width={58} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatWon(Number(value))}/>}/><Line dataKey="quoted" type="monotone" stroke="var(--color-quoted)" strokeWidth={3} dot={false}/><Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={3} dot={false}/></LineChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">사업장별 노무비 TOP 10</CardTitle></CardHeader><CardContent>{siteData.length ? <ChartContainer config={TOTAL_CONFIG} className="h-[310px] w-full aspect-auto"><BarChart data={siteData} layout="vertical" margin={{ left: 12, right: 28 }}><CartesianGrid horizontal={false}/><XAxis type="number" tickFormatter={amountTick} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatWon(Number(value))}/>}/><Bar dataKey="total" fill="var(--color-total)" radius={[0, 5, 5, 0]}/></BarChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
        </section>
        <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.65fr)]">
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">업체별 외주 노무비 TOP 10</CardTitle></CardHeader><CardContent>{companyData.length ? <ChartContainer config={TOTAL_CONFIG} className="h-[300px] w-full aspect-auto"><BarChart data={companyData} margin={{ left: 8, right: 16 }}><CartesianGrid vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false}/><YAxis tickFormatter={amountTick} width={58} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatWon(Number(value))}/>}/><Bar dataKey="total" fill="var(--color-total)" radius={[5, 5, 0, 0]}/></BarChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">진행 상태</CardTitle></CardHeader><CardContent className="space-y-4">{(Object.keys(STATUS_LABELS) as Status[]).map((key) => { const count = filtered.filter((item) => item.status === key).length; const ratio = filtered.length ? count / filtered.length * 100 : 0; return <div key={key}><div className="mb-1.5 flex justify-between text-sm"><span>{STATUS_LABELS[key]}</span><span className="font-medium">{count}건 · {ratio.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${ratio}%` }}/></div></div>; })}</CardContent></Card>
        </section>
        <Card className="border-slate-200 shadow-sm"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">프로젝트 상세</CardTitle><span className="text-sm text-slate-500">{filtered.length}건</span></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>기준일</TableHead><TableHead>프로젝트</TableHead><TableHead>사업장</TableHead><TableHead>업체</TableHead><TableHead>상태</TableHead><TableHead className="text-right">투입 인원</TableHead><TableHead className="text-right">견적 노무비</TableHead><TableHead className="text-right">실제 노무비</TableHead><TableHead className="text-right">차이</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => { const count = item.entries.reduce((sum, row) => sum + Number(row.headcount || 0), 0); const difference = Number(item.totalAmount || 0) - Number(item.quotedLaborAmount || 0); return <TableRow key={item.id}><TableCell className="whitespace-nowrap">{effectiveDate(item) || "-"}</TableCell><TableCell className="max-w-72 font-medium">{item.projectName}</TableCell><TableCell>{item.siteName || "-"}</TableCell><TableCell>{item.companyName || item.entries.find((row) => row.contractorType !== "self")?.contractorName || "-"}</TableCell><TableCell><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${STATUS_STYLES[item.status]}`}>{STATUS_LABELS[item.status]}</span></TableCell><TableCell className="text-right">{count.toLocaleString("ko-KR")}명</TableCell><TableCell className="text-right">{formatWon(item.quotedLaborAmount)}</TableCell><TableCell className="text-right font-medium">{formatWon(item.totalAmount)}</TableCell><TableCell className={`text-right ${difference > 0 ? "text-red-600" : "text-emerald-700"}`}>{difference > 0 ? "+" : ""}{formatWon(difference)}</TableCell></TableRow>; })}{!filtered.length && <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">조건에 맞는 프로젝트가 없습니다.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      </>
    </main>
  </div>;
}

function EmptyChart() { return <div className="grid h-[300px] place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">표시할 데이터가 없습니다.</div>; }
