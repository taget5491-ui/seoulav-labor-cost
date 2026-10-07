"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building2, CalendarRange, Download, FilePenLine, FileText, Printer, RotateCcw, Search, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateRow, formatWon, type LaborRow } from "@/lib/labor";

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
const COUNT_CONFIG = { count: { label: "공사 수", color: "#2563eb" } } satisfies ChartConfig;
const ALL = "__all__";

const amountTick = (value: number) => value >= 100_000_000 ? `${(value / 100_000_000).toFixed(1)}억` : value >= 10_000 ? `${Math.round(value / 10_000)}만` : String(value);
const escapeCell = (value: unknown) => String(value ?? "").replaceAll("\t", " ").replaceAll("\r", " ").replaceAll("\n", " ");
const effectiveDate = (item: Estimate) => item.startDate || item.updatedAt.slice(0, 10);
const matchesCompany = (item: Estimate, name: string) => name === "공무기술팀"
  ? item.entries.some((row) => row.contractorType === "self")
  : item.companyName === name || item.entries.some((row) => row.contractorName === name);
const companyLaborForEstimate = (item: Estimate, name: string) => item.entries
  .filter((row) => name === "공무기술팀" ? row.contractorType === "self" : row.contractorName === name || (!row.contractorName && item.companyName === name))
  .reduce((sum, row) => sum + calculateRow(row).totalAmount, 0);

export function LaborDashboard({ displayName, initialEstimates }: { displayName: string; initialEstimates: Estimate[] }) {
  const items = initialEstimates;
  const [search, setSearch] = useState("");
  const [site, setSite] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailCompany, setDetailCompany] = useState(ALL);
  const [detailSite, setDetailSite] = useState(ALL);
  const [detailScope, setDetailScope] = useState<"monthly" | "overall" | "site" | "company">("monthly");
  const [companyDetailsOpen, setCompanyDetailsOpen] = useState(false);
  const [summaryScope, setSummaryScope] = useState<"monthly" | "overall">("monthly");
  const latestMonth = useMemo(() => [...items].filter((item) => !item.archivedAt).map((item) => effectiveDate(item).slice(0, 7)).filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 7), [items]);
  const [selectedMonth, setSelectedMonth] = useState(latestMonth);

  const sites = useMemo(() => [...new Set(items.map((item) => item.siteName).filter(Boolean))].sort(), [items]);
  const companies = useMemo(() => [...new Set(items.flatMap((item) => [item.companyName, ...item.entries.filter((row) => row.contractorType !== "self").map((row) => row.contractorName)]).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (item.archivedAt) return false;
    const date = effectiveDate(item);
    const text = `${item.projectName} ${item.siteName} ${item.companyName} ${item.managerName} ${item.entries.map((row) => row.contractorName).join(" ")}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (site === ALL || item.siteName === site)
      && (company === ALL || item.companyName === company || item.entries.some((row) => row.contractorName === company))
      && (status === ALL || item.status === status) && (!from || date >= from) && (!to || date <= to);
  }).sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || a.projectName.localeCompare(b.projectName, "ko")), [items, search, site, company, status, from, to]);

  const summaries = useMemo(() => {
    const totals = summarize(filtered);
    const internal = filtered.reduce((sum, item) => sum + Number(item.internalLaborAmount || 0), 0);
    const headcount = filtered.reduce((sum, item) => sum + item.entries.reduce((entrySum, row) => entrySum + Number(row.headcount || 0), 0), 0);
    return { ...totals, internal, headcount };
  }, [filtered]);

  const siteData = useMemo(() => {
    const map = new Map<string, { count: number; quoted: number; actual: number }>();
    filtered.forEach((item) => {
      const name = item.siteName || "미지정";
      const current = map.get(name) ?? { count: 0, quoted: 0, actual: 0 };
      current.count += 1; current.quoted += Number(item.quotedLaborAmount || 0); current.actual += Number(item.totalAmount || 0); map.set(name, current);
    });
    return [...map].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.count - a.count || b.actual - a.actual);
  }, [filtered]);
  const companyData = useMemo(() => aggregateCompanies(filtered), [filtered]);
  const monthlyData = useMemo(() => {
    const map = new Map<string, { quoted: number; actual: number }>();
    filtered.forEach((item) => {
      const month = effectiveDate(item).slice(0, 7) || "날짜 미지정";
      const current = map.get(month) ?? { quoted: 0, actual: 0 };
      current.quoted += Number(item.quotedLaborAmount || 0); current.actual += Number(item.totalAmount || 0); map.set(month, current);
    });
    return [...map].map(([month, value]) => ({ month, ...value })).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const monthlyItems = useMemo(() => filtered.filter((item) => effectiveDate(item).slice(0, 7) === selectedMonth), [filtered, selectedMonth]);
  const monthlySummary = useMemo(() => summarize(monthlyItems), [monthlyItems]);
  const monthlySites = useMemo(() => aggregateSites(monthlyItems), [monthlyItems]);
  const monthlyCompanies = useMemo(() => aggregateCompanies(monthlyItems), [monthlyItems]);
  const activeSummary = summaryScope === "monthly" ? monthlySummary : summaries;
  const activeSites = summaryScope === "monthly" ? monthlySites : siteData;
  const activeCompanies = summaryScope === "monthly" ? monthlyCompanies : companyData;
  const detailSites = useMemo(() => [...new Set(filtered.map((item) => item.siteName || "미지정"))].sort(), [filtered]);
  const detailItems = useMemo(() => filtered.filter((item) => {
    const scopeMatches = detailScope === "monthly" ? effectiveDate(item).slice(0, 7) === selectedMonth
      : detailScope === "site" ? detailSite === ALL || (item.siteName || "미지정") === detailSite
        : true;
    return scopeMatches && (detailCompany === ALL || matchesCompany(item, detailCompany));
  }), [filtered, detailCompany, detailSite, detailScope, selectedMonth]);
  const detailCompanyTotal = useMemo(() => detailCompany === ALL ? 0 : detailItems.reduce((sum, item) => sum + companyLaborForEstimate(item, detailCompany), 0), [detailItems, detailCompany]);
  const detailSummary = useMemo(() => summarize(detailItems), [detailItems]);

  const resetFilters = () => { setSearch(""); setSite(ALL); setCompany(ALL); setStatus(ALL); setFrom(""); setTo(""); setDetailCompany(ALL); setDetailSite(ALL); setDetailScope("monthly"); };
  const exportReport = () => {
    const rows: unknown[][] = [
      ["서울영상테크 노무비 통합 보고서"], ["생성일", new Date().toLocaleString("ko-KR")],
      ["필터", `기간 ${from || "전체"}~${to || "전체"} / 사업장 ${site === ALL ? "전체" : site} / 업체 ${company === ALL ? "전체" : company} / 상태 ${status === ALL ? "전체" : STATUS_LABELS[status as Status]}`], [],
      ["요약"], ["프로젝트", filtered.length, "실제 노무비", summaries.actual, "견적 노무비", summaries.quoted, "집행률", `${summaries.rate.toFixed(1)}%`, "공무기술팀", summaries.internal], [],
      ["프로젝트별 상세"], ["기준일", "프로젝트", "사업장", "업체", "상태", "담당자", "투입 인원", "견적 노무비", "실제 노무비", "공무기술팀 노무비"],
      ...filtered.map((item) => [effectiveDate(item), item.projectName, item.siteName, item.companyName, STATUS_LABELS[item.status], item.managerName, item.entries.reduce((sum, row) => sum + Number(row.headcount || 0), 0), item.quotedLaborAmount, item.totalAmount, item.internalLaborAmount]),
      [], ["월별 총 집계", selectedMonth], ["공사 수", monthlySummary.count, "견적 노무비", monthlySummary.quoted, "실제 노무비", monthlySummary.actual, "집행률", `${monthlySummary.rate.toFixed(1)}%`],
      ["월별 사업장", "공사 수", "견적 노무비", "실제 노무비"], ...monthlySites.map((row) => [row.name, row.count, row.quoted, row.actual]),
      ["월별 업체", "공사 수", "노무비"], ...monthlyCompanies.map((row) => [row.name, row.count, row.total]),
      [], ["전체 총 집계"], ["공사 수", summaries.count, "견적 노무비", summaries.quoted, "실제 노무비", summaries.actual, "집행률", `${summaries.rate.toFixed(1)}%`],
      [], ["사업장별 요약"], ["사업장", "공사 수", "견적 노무비", "실제 노무비"], ...siteData.map((row) => [row.name, row.count, row.quoted, row.actual]),
      [], ["업체별 요약"], ["업체", "공사 수", "노무비"], ...companyData.map((row) => [row.name, row.count, row.total]),
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
        <section className="mb-8 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-semibold tracking-[0.18em] text-cyan-700">LABOR SUMMARY</p><h2 className="mt-1 text-xl font-semibold">{summaryScope === "monthly" ? "월별 총 집계현황" : "전체 총 집계현황"}</h2><p className="mt-1 text-sm text-slate-500">{summaryScope === "monthly" ? "선택한 월의 사업장·업체별 공사 수와 노무비를 확인합니다." : "현재 필터 조건에 포함된 전체 사업장·업체별 공사 수와 노무비를 확인합니다."}</p></div>
            <div className="no-print flex flex-wrap items-end gap-3"><div className="flex rounded-lg border border-slate-200 bg-white p-1"><Button size="sm" variant={summaryScope === "monthly" ? "default" : "ghost"} onClick={() => setSummaryScope("monthly")}>월별</Button><Button size="sm" variant={summaryScope === "overall" ? "default" : "ghost"} onClick={() => setSummaryScope("overall")}>전체</Button></div>{summaryScope === "monthly" && <div className="space-y-1.5"><Label htmlFor="summary-month">집계 월</Label><Input id="summary-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="w-44 bg-white" /></div>}</div>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={summaryScope === "monthly" ? "월 공사 수" : "전체 공사 수"} value={`${activeSummary.count}건`} sub={summaryScope === "monthly" ? `${selectedMonth || "월 미지정"} 기준` : "현재 필터 전체"} />
            <MetricCard label="견적 노무비 합계" value={formatWon(activeSummary.quoted)} sub={summaryScope === "monthly" ? "선택 월 견적 합계" : "전체 견적 합계"} />
            <MetricCard label="실제 노무비 합계" value={formatWon(activeSummary.actual)} sub={summaryScope === "monthly" ? "선택 월 실제 집행" : "전체 실제 집행"} />
            <MetricCard label="노무비 집행률" value={`${activeSummary.rate.toFixed(1)}%`} sub={activeSummary.rate > 100 ? "견적 초과" : "견적 대비 실제"} alert={activeSummary.rate > 100} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <SummaryPanel title={`${summaryScope === "monthly" ? "월별" : "전체"} 사업장별 공사 수`} rows={activeSites} kind="site" />
            <SummaryPanel title={`${summaryScope === "monthly" ? "월별" : "전체"} 업체별 노무비와 공사 수`} rows={activeCompanies} kind="company" />
          </div>
        </section>
        <section className="mb-5 grid gap-5 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">월별 견적 대비 실제 노무비</CardTitle><p className="text-sm text-slate-500">각 월의 견적 금액과 실제 투입된 노무비를 비교합니다.</p><div className="flex flex-wrap gap-4 pt-1 text-sm"><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-cyan-600" />파란색 · 견적서상 노무비</span><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-amber-500" />주황색 · 실제 투입 노무비</span></div></CardHeader><CardContent>{monthlyData.length ? <ChartContainer config={TREND_CONFIG} className="h-[310px] w-full aspect-auto"><LineChart data={monthlyData} margin={{ left: 8, right: 16 }}><CartesianGrid vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickFormatter={amountTick} width={58} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatWon(Number(value))}/>}/><Line dataKey="quoted" type="monotone" stroke="var(--color-quoted)" strokeWidth={3} dot={false}/><Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={3} dot={false}/></LineChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">전체 사업장별 공사 수</CardTitle></CardHeader><CardContent>{siteData.length ? <ChartContainer config={COUNT_CONFIG} className="h-[310px] w-full aspect-auto"><BarChart data={siteData.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 28 }}><CartesianGrid horizontal={false}/><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toLocaleString("ko-KR")}건`}/>}/><Bar dataKey="count" fill="var(--color-count)" radius={[0, 5, 5, 0]}/></BarChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
        </section>
        <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.65fr)]">
          <Card className="border-slate-200 shadow-sm"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">전체 업체별 노무비 합계</CardTitle><Button variant="outline" size="sm" onClick={() => setCompanyDetailsOpen(true)}>자세히</Button></div><p className="text-sm text-slate-500">업체 막대를 누르면 아래 프로젝트 상세의 업체별 보기로 연결됩니다.</p></CardHeader><CardContent>{companyData.length ? <ChartContainer config={TOTAL_CONFIG} className="h-[300px] w-full aspect-auto"><BarChart data={companyData.slice(0, 10)} margin={{ left: 8, right: 16 }}><CartesianGrid vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false}/><YAxis tickFormatter={amountTick} width={58} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatWon(Number(value))}/>}/><Bar dataKey="total" fill="var(--color-total)" radius={[5, 5, 0, 0]} className="cursor-pointer" onClick={(entry) => { const selected = entry as unknown as { name?: string; payload?: { name?: string } }; const name = selected.name || selected.payload?.name; if (name) { setDetailCompany(name); setDetailScope("company"); } }}/></BarChart></ChartContainer> : <EmptyChart />}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">진행 상태</CardTitle></CardHeader><CardContent className="space-y-4">{(Object.keys(STATUS_LABELS) as Status[]).map((key) => { const count = filtered.filter((item) => item.status === key).length; const ratio = filtered.length ? count / filtered.length * 100 : 0; return <div key={key}><div className="mb-1.5 flex justify-between text-sm"><span>{STATUS_LABELS[key]}</span><span className="font-medium">{count}건 · {ratio.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${ratio}%` }}/></div></div>; })}</CardContent></Card>
        </section>
        <Card className="border-slate-200 shadow-sm"><CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">프로젝트 상세</CardTitle><p className="mt-1 text-sm text-slate-500">월별·전체·사이트별·업체별로 프로젝트 내역을 확인합니다.</p>{detailCompany !== ALL && <p className="mt-1 text-sm font-medium text-cyan-700">선택 업체: {detailCompany}{detailScope === "company" ? ` · 노무비 합계 ${formatWon(detailCompanyTotal)}` : ""}</p>}</div><span className="text-sm text-slate-500">{detailItems.length}건</span></div><div className="no-print flex flex-wrap items-center gap-2"><div className="flex rounded-lg border border-slate-200 bg-white p-1"><Button size="sm" variant={detailScope === "monthly" ? "default" : "ghost"} onClick={() => setDetailScope("monthly")}>월별</Button><Button size="sm" variant={detailScope === "overall" ? "default" : "ghost"} onClick={() => setDetailScope("overall")}>전체</Button><Button size="sm" variant={detailScope === "site" ? "default" : "ghost"} onClick={() => { setDetailScope("site"); if (detailSite === ALL && detailSites[0]) setDetailSite(detailSites[0]); }}>사이트별</Button><Button size="sm" variant={detailScope === "company" ? "default" : "ghost"} onClick={() => { setDetailScope("company"); if (detailCompany === ALL && companyData[0]) setDetailCompany(companyData[0].name); }}>업체별</Button></div>{detailScope === "monthly" && <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="w-44" aria-label="프로젝트 상세 월" />}{detailScope === "site" && <Select value={detailSite} onValueChange={setDetailSite}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{detailSites.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>}{detailScope === "company" && <Select value={detailCompany} onValueChange={setDetailCompany}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{companyData.map((value) => <SelectItem key={value.name} value={value.name}>{value.name}</SelectItem>)}</SelectContent></Select>}{detailCompany !== ALL && detailScope !== "company" && <Button variant="outline" size="sm" onClick={() => setDetailCompany(ALL)}>업체 선택 해제</Button>}</div></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>기준일</TableHead><TableHead>프로젝트</TableHead><TableHead>사업장</TableHead><TableHead>업체</TableHead><TableHead>상태</TableHead><TableHead className="text-right">투입 인원</TableHead><TableHead className="text-right">견적 노무비</TableHead><TableHead className="text-right">{detailScope === "company" ? "업체 노무비" : "실제 노무비"}</TableHead><TableHead className="text-right">차이</TableHead><TableHead className="text-center">관리</TableHead></TableRow></TableHeader><TableBody>{detailItems.map((item) => { const count = item.entries.reduce((sum, row) => sum + Number(row.headcount || 0), 0); const shownActual = detailScope === "company" && detailCompany !== ALL ? companyLaborForEstimate(item, detailCompany) : Number(item.totalAmount || 0); const difference = detailScope === "company" ? 0 : shownActual - Number(item.quotedLaborAmount || 0); return <TableRow key={item.id}><TableCell className="whitespace-nowrap">{effectiveDate(item) || "-"}</TableCell><TableCell className="max-w-72 font-medium">{item.projectName}</TableCell><TableCell>{item.siteName || "-"}</TableCell><TableCell>{detailScope === "company" && detailCompany !== ALL ? detailCompany : item.companyName || item.entries.find((row) => row.contractorType !== "self")?.contractorName || "-"}</TableCell><TableCell><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${STATUS_STYLES[item.status]}`}>{STATUS_LABELS[item.status]}</span></TableCell><TableCell className="text-right">{count.toLocaleString("ko-KR")}명</TableCell><TableCell className="text-right">{formatWon(item.quotedLaborAmount)}</TableCell><TableCell className="text-right font-medium">{formatWon(shownActual)}</TableCell><TableCell className={`text-right ${difference > 0 ? "text-red-600" : "text-emerald-700"}`}>{detailScope === "company" ? "-" : <>{difference > 0 ? "+" : ""}{formatWon(difference)}</>}</TableCell><TableCell className="text-center">{item.status === "closed" ? <a href={`/?edit=${encodeURIComponent(item.id)}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><FilePenLine className="size-4" />수정</a> : <span className="text-slate-300">-</span>}</TableCell></TableRow>; })}{!detailItems.length && <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">선택 조건에 해당하는 프로젝트가 없습니다.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        {detailScope === "site" && <div className="mt-3 grid gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">선택 사이트</p><p className="mt-1 font-semibold text-cyan-900">{detailSite} · {detailItems.length.toLocaleString("ko-KR")}건</p></div><div><p className="text-xs text-slate-500">견적 노무비 총합</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatWon(detailSummary.quoted)}</p></div><div><p className="text-xs text-slate-500">실제 노무비 총합</p><p className="mt-1 text-lg font-semibold text-cyan-800">{formatWon(detailSummary.actual)}</p></div></div>}
      </>
    </main>
    <Dialog open={companyDetailsOpen} onOpenChange={setCompanyDetailsOpen}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>전체 업체별 노무비 상세</DialogTitle>
          <DialogDescription>현재 상단 필터에 포함된 모든 업체의 공사 건수와 노무비 합계입니다. 업체를 누르면 프로젝트 상세에서 해당 업체 내역을 확인할 수 있습니다.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[58vh] overflow-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader><TableRow><TableHead>업체</TableHead><TableHead className="text-right">공사 수</TableHead><TableHead className="text-right">노무비 합계</TableHead></TableRow></TableHeader>
            <TableBody>
              {companyData.map((row) => <TableRow key={row.name} className="cursor-pointer hover:bg-cyan-50" onClick={() => { setDetailCompany(row.name); setDetailScope("company"); setCompanyDetailsOpen(false); }}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right">{row.count.toLocaleString("ko-KR")}건</TableCell><TableCell className="text-right font-semibold">{formatWon(row.total)}</TableCell></TableRow>)}
              {!companyData.length && <TableRow><TableCell colSpan={3} className="h-28 text-center text-slate-500">표시할 업체 데이터가 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-600">전체 업체 노무비 합계</span><span className="text-lg font-semibold text-cyan-800">{formatWon(companyData.reduce((sum, row) => sum + row.total, 0))}</span></div>
      </DialogContent>
    </Dialog>
  </div>;
}

function MetricCard({ label, value, sub, alert = false }: { label: string; value: string; sub: string; alert?: boolean }) {
  return <div className="rounded-xl border border-white bg-white/90 p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${alert ? "text-red-600" : "text-slate-900"}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>;
}

function SummaryPanel({ title, rows, kind }: { title: string; rows: Array<{ name: string; total?: number; count?: number; quoted?: number; actual?: number }>; kind: "site" | "company" }) {
  const chartRows = rows.slice(0, 8);
  return <Card className="border-white bg-white/90 shadow-sm"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-4">
    {chartRows.length ? <ChartContainer config={kind === "site" ? COUNT_CONFIG : TOTAL_CONFIG} className="h-[250px] w-full aspect-auto"><BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 22 }}><CartesianGrid horizontal={false}/><XAxis type="number" allowDecimals={kind !== "site"} tickFormatter={kind === "site" ? undefined : amountTick} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={92} tickLine={false} axisLine={false}/><ChartTooltip content={<ChartTooltipContent formatter={(value) => kind === "site" ? `${Number(value).toLocaleString("ko-KR")}건` : formatWon(Number(value))}/>}/><Bar dataKey={kind === "site" ? "count" : "total"} fill={kind === "site" ? "var(--color-count)" : "var(--color-total)"} radius={[0, 5, 5, 0]}/></BarChart></ChartContainer> : <EmptyChart compact />}
    {!!rows.length && <div className="max-h-60 overflow-auto rounded-lg border border-slate-200"><Table><TableHeader><TableRow><TableHead>{kind === "site" ? "사업장" : "업체"}</TableHead><TableHead className="text-right">공사 수</TableHead>{kind === "site" && <TableHead className="text-right">견적</TableHead>}<TableHead className="text-right">{kind === "site" ? "실제" : "노무비 합계"}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.name}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right">{row.count?.toLocaleString("ko-KR")}건</TableCell>{kind === "site" && <TableCell className="text-right">{formatWon(row.quoted ?? 0)}</TableCell>}<TableCell className="text-right">{formatWon(kind === "site" ? row.actual ?? 0 : row.total ?? 0)}</TableCell></TableRow>)}</TableBody></Table></div>}
  </CardContent></Card>;
}

function EmptyChart({ compact = false }: { compact?: boolean }) { return <div className={`grid place-items-center rounded-xl bg-slate-50 text-sm text-slate-500 ${compact ? "h-[250px]" : "h-[300px]"}`}>표시할 데이터가 없습니다.</div>; }

function summarize(items: Estimate[]) {
  const quoted = items.reduce((sum, item) => sum + Number(item.quotedLaborAmount || 0), 0);
  const actual = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  return { count: items.length, quoted, actual, rate: quoted ? (actual / quoted) * 100 : 0 };
}

function aggregateSites(items: Estimate[]) {
  const map = new Map<string, { count: number; quoted: number; actual: number }>();
  items.forEach((item) => {
    const name = item.siteName || "미지정";
    const current = map.get(name) ?? { count: 0, quoted: 0, actual: 0 };
    current.count += 1; current.quoted += Number(item.quotedLaborAmount || 0); current.actual += Number(item.totalAmount || 0); map.set(name, current);
  });
  return [...map].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.count - a.count || b.actual - a.actual);
}

function aggregateCompanies(items: Estimate[]) {
  const map = new Map<string, { total: number; projectIds: Set<string> }>();
  items.forEach((item) => item.entries.forEach((row) => {
    const name = row.contractorType === "self" ? "공무기술팀" : row.contractorName || item.companyName || "업체 미지정";
    const current = map.get(name) ?? { total: 0, projectIds: new Set<string>() };
    current.total += calculateRow(row).totalAmount;
    current.projectIds.add(item.id);
    map.set(name, current);
  }));
  return [...map].map(([name, value]) => ({ name, total: value.total, count: value.projectIds.size })).sort((a, b) => b.total - a.total);
}
