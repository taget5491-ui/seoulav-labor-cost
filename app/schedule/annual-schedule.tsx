"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarRange, LayoutDashboard, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoutButton } from "@/app/logout-button";
import { formatWon } from "@/lib/labor";

export type ScheduleProject = {
  id: string;
  projectName: string;
  siteName: string;
  companyName: string;
  managerName: string;
  startDate: string;
  endDate: string;
  status: string;
  quotedLaborAmount: number;
  actualLaborAmount: number;
  companyCosts: { name: string; amount: number }[];
};

const ALL = "__all__";
const DAY_WIDTH = 27;
const isoDate = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
function weekendClass(date: string) { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day === 0 ? "text-red-500 bg-red-50" : day === 6 ? "text-blue-500 bg-blue-50" : "text-slate-600"; }
function tone(status: string) { return status === "closed" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-900"; }
function projectNameColor(status: string) { return status === "closed" ? "text-black hover:text-slate-700" : "text-blue-700 hover:text-blue-500"; }
function scheduleStatus(status: string) { return status === "closed" ? "종료" : "진행중"; }

export function AnnualSchedule({ projects, displayName, isAdmin }: { projects: ScheduleProject[]; displayName: string; isAdmin: boolean }) {
  const availableYears = useMemo(() => {
    const values = new Set<number>([new Date().getFullYear()]);
    projects.forEach((item) => { values.add(Number(item.startDate.slice(0, 4))); values.add(Number(item.endDate.slice(0, 4))); });
    return [...values].filter(Number.isFinite).sort((a, b) => b - a);
  }, [projects]);
  const [year, setYear] = useState(availableYears[0]);
  const [site, setSite] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [company, setCompany] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScheduleProject | null>(null);
  const scheduleScrollRef = useRef<HTMLElement>(null);
  const fixedScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const months = useMemo(() => Array.from({ length: 12 }, (_, month) => ({ month, count: daysInMonth(year, month) })), [year]);
  const days = useMemo(() => months.flatMap(({ month, count }) => Array.from({ length: count }, (_, index) => isoDate(year, month, index + 1))), [months, year]);
  const sites = useMemo(() => [...new Set(projects.map((item) => item.siteName))].sort((a, b) => a.localeCompare(b, "ko")), [projects]);
  const managers = useMemo(() => [...new Set(projects.map((item) => item.managerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [projects]);
  const companies = useMemo(() => [...new Set(projects.map((item) => item.companyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [projects]);
  const visible = useMemo(() => projects.filter((item) => item.startDate <= `${year}-12-31` && item.endDate >= `${year}-01-01` && (site === ALL || item.siteName === site) && (manager === ALL || item.managerName === manager) && (company === ALL || item.companyName === company) && (status === ALL || (status === "closed" ? item.status === "closed" : item.status !== "closed")) && [item.projectName, item.siteName, item.companyName, item.managerName].join(" ").toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.siteName.localeCompare(b.siteName, "ko") || a.startDate.localeCompare(b.startDate)), [company, manager, projects, search, site, status, year]);
  const difference = selected ? selected.quotedLaborAmount - selected.actualLaborAmount : 0;
  const executionRate = selected?.quotedLaborAmount ? selected.actualLaborAmount / selected.quotedLaborAmount * 100 : 0;

  useEffect(() => {
    const schedule = scheduleScrollRef.current;
    if (!schedule) return;
    const updateWidth = () => setScrollWidth(schedule.scrollWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(schedule);
    if (schedule.firstElementChild) observer.observe(schedule.firstElementChild);
    return () => observer.disconnect();
  }, [days.length, visible.length]);

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (target && Math.abs(target.scrollLeft - source.scrollLeft) > 1) target.scrollLeft = source.scrollLeft;
  };

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <header className="no-print border-b border-slate-200 bg-[#0c2340] text-white shadow-sm">
      <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><CalendarRange className="size-5" /></div><div><p className="text-lg font-semibold">연간 공사 일정</p><p className="text-xs text-slate-300">1월부터 12월까지 전체 일정</p></div></div>
        <div className="flex items-center gap-2"><a href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium hover:bg-white/20"><LayoutDashboard className="size-4" /> 통합 대시보드</a>{isAdmin && <a href="/" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium hover:bg-white/20"><ArrowLeft className="size-4" /> 산정 화면</a>}{isAdmin ? <LogoutButton /> : <a href="/login?return_to=/schedule" className="inline-flex h-9 items-center rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium hover:bg-white/20">관리자 로그인</a>}<div className="hidden text-right sm:block"><p className="text-sm">{displayName}</p><p className="text-xs text-slate-300">{isAdmin ? "관리자" : "조회"}</p></div></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1900px] px-4 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-cyan-700">YEARLY SCHEDULE</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{year}년 공사 일정표</h1><p className="mt-1 text-sm text-slate-500">공사명을 누르면 건별 노무비 현황을 확인할 수 있습니다.</p></div>
        <div className="no-print flex flex-wrap gap-2"><Select value={String(year)} onValueChange={(value) => setYear(Number(value))}><SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger><SelectContent>{availableYears.map((item) => <SelectItem key={item} value={String(item)}>{item}년</SelectItem>)}</SelectContent></Select><Select value={site} onValueChange={setSite}><SelectTrigger className="w-40 bg-white"><SelectValue placeholder="전체 사이트" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 사이트</SelectItem>{sites.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={manager} onValueChange={setManager}><SelectTrigger className="w-36 bg-white"><SelectValue placeholder="전체 담당" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 담당</SelectItem>{managers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={company} onValueChange={setCompany}><SelectTrigger className="w-40 bg-white"><SelectValue placeholder="전체 업체명" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 업체명</SelectItem>{companies.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="w-64 bg-white pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="공사명 검색" /></div><Button variant="outline" onClick={() => window.print()}><Printer /> PDF 출력</Button></div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="mr-2">총 <b className="text-slate-900">{visible.length}</b>건</span><button type="button" onClick={() => setStatus(status === "active" ? ALL : "active")} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition ${status === "active" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:border-blue-300"}`}><i className="size-3 rounded-sm bg-blue-100" /> 진행중</button><button type="button" onClick={() => setStatus(status === "closed" ? ALL : "closed")} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition ${status === "closed" ? "border-slate-600 bg-slate-100 text-slate-900" : "border-slate-200 bg-white hover:border-slate-400"}`}><i className="size-3 rounded-sm bg-slate-200" /> 종료</button><span className="ml-2 text-blue-600">토요일</span><span className="text-red-600">일요일</span></div>
      <section ref={scheduleScrollRef} onScroll={(event) => syncScroll(event.currentTarget, fixedScrollRef.current)} className="annual-scroll overflow-auto rounded-xl border border-slate-300 bg-white shadow-sm">
        <table className="border-collapse text-xs" style={{ minWidth: 570 + days.length * DAY_WIDTH }}>
          <thead className="sticky top-0 z-30 bg-white"><tr><th rowSpan={2} className="sticky left-0 z-40 w-[110px] min-w-[110px] border border-slate-300 bg-slate-100 px-2">사이트</th><th rowSpan={2} className="sticky left-[110px] z-40 w-[280px] min-w-[280px] border border-slate-300 bg-slate-100 px-2">공사명</th><th rowSpan={2} className="sticky left-[390px] z-40 w-[80px] min-w-[80px] border border-slate-300 bg-slate-100 px-2">담당</th><th rowSpan={2} className="sticky left-[470px] z-40 w-[100px] min-w-[100px] border border-slate-300 bg-slate-100 px-2">업체명</th>{months.map(({ month, count }) => <th key={month} colSpan={count} className="h-8 border border-slate-400 bg-slate-100 text-sm font-semibold">{month + 1}월</th>)}</tr><tr>{days.map((date) => <th key={date} className={`h-7 min-w-[27px] border border-slate-300 p-0 text-[10px] font-medium ${weekendClass(date)}`} style={{ width: DAY_WIDTH }}>{Number(date.slice(8))}</th>)}</tr></thead>
          <tbody>{visible.map((item) => { const firstVisible = item.startDate < `${year}-01-01` ? `${year}-01-01` : item.startDate; return <tr key={item.id} className="h-9"><td className="sticky left-0 z-20 border border-slate-300 bg-white px-2 font-semibold">{item.siteName}</td><td className="sticky left-[110px] z-20 max-w-[280px] border border-slate-300 bg-white px-2 font-medium"><button type="button" onClick={() => setSelected(item)} className={`block w-full truncate text-left underline-offset-2 hover:underline ${projectNameColor(item.status)}`} title={`${item.projectName} 노무비 현황 보기`}>{item.projectName}</button></td><td className="sticky left-[390px] z-20 border border-slate-300 bg-white px-2 text-center">{item.managerName}</td><td className="sticky left-[470px] z-20 border border-slate-300 bg-white px-2 text-center">{item.companyName}</td>{days.map((date) => { const active = date >= item.startDate && date <= item.endDate; const first = active && date === firstVisible; const emptyTone = weekendClass(date).includes("bg-") ? weekendClass(date).split(" ").find((value) => value.startsWith("bg-")) : ""; return <td key={date} className={`relative min-w-[27px] border border-slate-200 p-0 ${active ? tone(item.status) : emptyTone}`} style={{ width: DAY_WIDTH }}>{first && <button type="button" onClick={() => setSelected(item)} className={`absolute left-1 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold hover:underline ${projectNameColor(item.status)}`}>{scheduleStatus(item.status)} · {item.projectName}</button>}</td>; })}</tr>; })}{!visible.length && <tr><td colSpan={days.length + 4} className="h-32 text-center text-sm text-slate-500">선택한 조건에 표시할 공사 일정이 없습니다.</td></tr>}</tbody>
        </table>
      </section>
    </main>

    <div ref={fixedScrollRef} onScroll={(event) => syncScroll(event.currentTarget, scheduleScrollRef.current)} className="no-print fixed inset-x-4 bottom-0 z-50 overflow-x-auto overflow-y-hidden rounded-t-lg border border-b-0 border-slate-300 bg-white/95 shadow-[0_-4px_12px_rgba(15,23,42,0.12)] lg:inset-x-8" style={{ height: 18 }} aria-label="연간 일정 가로 스크롤"><div style={{ width: scrollWidth, height: 1 }} /></div>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.projectName}</DialogTitle><DialogDescription>{selected?.siteName} · {selected?.startDate} ~ {selected?.endDate} · 담당 {selected?.managerName}</DialogDescription></DialogHeader>
        {selected && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">견적 노무비</p><p className="mt-1 text-lg font-semibold">{formatWon(selected.quotedLaborAmount)}</p></div><div className="rounded-xl bg-cyan-50 p-4"><p className="text-xs text-cyan-700">실제 노무비</p><p className="mt-1 text-lg font-semibold text-cyan-800">{formatWon(selected.actualLaborAmount)}</p></div><div className={`rounded-xl p-4 ${difference < 0 ? "bg-red-50" : "bg-emerald-50"}`}><p className={`text-xs ${difference < 0 ? "text-red-600" : "text-emerald-700"}`}>잔여 금액</p><p className={`mt-1 text-lg font-semibold ${difference < 0 ? "text-red-700" : "text-emerald-800"}`}>{formatWon(difference)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">집행률</p><p className={`mt-1 text-lg font-semibold ${executionRate > 100 ? "text-red-600" : "text-slate-900"}`}>{executionRate.toFixed(1)}%</p></div></div>
          <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">업체별 노무비</h3><span className="text-xs text-slate-500">상태: {scheduleStatus(selected.status)}</span></div><div className="overflow-hidden rounded-xl border border-slate-200">{selected.companyCosts.length ? [...selected.companyCosts].sort((a, b) => b.amount - a.amount).map((item) => <div key={item.name} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"><span className="font-medium">{item.name}</span><span className="font-semibold">{formatWon(item.amount)}</span></div>) : <p className="p-5 text-center text-sm text-slate-500">등록된 업체별 노무비가 없습니다.</p>}</div></div>
          {isAdmin && <div className="flex justify-end"><a href={`/?edit=${encodeURIComponent(selected.id)}`} className="inline-flex h-9 items-center rounded-md bg-[#0c2340] px-4 text-sm font-medium text-white hover:bg-[#16385f]">이 공사 수정하기</a></div>}
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
