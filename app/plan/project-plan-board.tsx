"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, LayoutDashboard, Plus, Save, Trash2, X } from "lucide-react";
import { LogoutButton } from "@/app/logout-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isKoreanPublicHoliday } from "@/lib/labor";

export type PlanItem = { id: string; source: "manual"; siteName: string; projectName: string; managerName: string; companyName: string; riskGrade: string; startDate: string; endDate: string; workDescription: string; status: string };
type FormState = Omit<PlanItem, "id" | "source">;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const EMPTY: FormState = { siteName: "", projectName: "", managerName: "", companyName: "", riskGrade: "일반작업", startDate: today(), endDate: today(), workDescription: "", status: "planned" };
const ALL = "__all__";
const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const riskColor = (value: string) => value.startsWith("C급") ? "text-red-600" : value.startsWith("D급") ? "text-orange-600" : "text-slate-900";
const statusLabel = (value: string) => value === "completed" ? "완료" : value === "active" ? "진행중" : "계획";
const statusStyle = (value: string) => value === "completed" ? "bg-slate-100 text-slate-600" : value === "active" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";

export function ProjectPlanBoard({ initialItems, displayName, canEdit }: { initialItems: PlanItem[]; displayName: string; canEdit: boolean }) {
  const now = new Date();
  const [items, setItems] = useState(initialItems);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [site, setSite] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const monthStart = `${year}-${pad(month)}-01`;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${pad(month)}-${pad(dayCount)}`;
  const days = Array.from({ length: dayCount }, (_, index) => isoDate(year, month, index + 1));
  const sites = useMemo(() => [...new Set(items.map((item) => item.siteName))].sort((a, b) => a.localeCompare(b, "ko")), [items]);
  const visible = useMemo(() => items.filter((item) => item.startDate <= monthEnd && item.endDate >= monthStart && (site === ALL || item.siteName === site) && (status === ALL || item.status === status) && `${item.siteName} ${item.projectName} ${item.managerName} ${item.companyName} ${item.workDescription}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.siteName.localeCompare(b.siteName, "ko")), [items, monthEnd, monthStart, search, site, status]);
  const field = (key: keyof FormState, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  const moveMonth = (amount: number) => { const date = new Date(year, month - 1 + amount, 1); setYear(date.getFullYear()); setMonth(date.getMonth() + 1); };
  const startCreate = () => { const date = monthStart < today() ? today() : monthStart; setEditing(null); setForm({ ...EMPTY, startDate: date, endDate: date }); setError(""); setOpen(true); };
  const startEdit = (item: PlanItem) => { setEditing(item); setForm({ siteName: item.siteName, projectName: item.projectName, managerName: item.managerName, companyName: item.companyName, riskGrade: item.riskGrade, startDate: item.startDate, endDate: item.endDate, workDescription: item.workDescription, status: item.status }); setError(""); setOpen(true); };
  const save = async () => { setSaving(true); setError(""); try { const response = await fetch("/api/project-plans", { method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing ? { ...form, id: editing.id } : form) }); const data = await response.json() as { id?: string; error?: string }; if (!response.ok) throw new Error(data.error || "저장하지 못했습니다."); const next: PlanItem = { id: editing?.id || String(data.id), source: "manual", ...form }; setItems((previous) => editing ? previous.map((item) => item.id === editing.id ? next : item) : [...previous, next]); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); } finally { setSaving(false); } };
  const remove = async () => { if (!editing || !confirm("이 계획을 삭제할까요?")) return; setSaving(true); const response = await fetch(`/api/project-plans?id=${encodeURIComponent(editing.id)}`, { method: "DELETE" }); if (response.ok) { setItems((previous) => previous.filter((item) => item.id !== editing.id)); setOpen(false); } else { const data = await response.json() as { error?: string }; setError(data.error || "삭제하지 못했습니다."); } setSaving(false); };

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <header className="border-b border-slate-200 bg-[#0c2340] text-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><CalendarClock className="size-5" /></span><div><p className="text-lg font-semibold">프로젝트 계획표</p><p className="text-xs text-slate-300">첨부 공정표 기준 향후 일정 관리</p></div></div><div className="flex flex-wrap items-center gap-2"><a href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 text-sm hover:bg-white/20"><LayoutDashboard className="size-4" /> 통합 대시보드</a><a href="/schedule" className="inline-flex h-9 items-center rounded-md border border-white/25 bg-white/10 px-4 text-sm hover:bg-white/20">연간 일정</a>{canEdit ? <><a href="/" className="inline-flex h-9 items-center rounded-md border border-white/25 bg-white/10 px-4 text-sm hover:bg-white/20">산정 화면</a><LogoutButton /></> : <a href="/login?return_to=/plan" className="inline-flex h-9 items-center rounded-md border border-white/25 bg-white/10 px-4 text-sm hover:bg-white/20">관리자 로그인</a>}<span className="hidden text-sm text-slate-200 sm:inline">{displayName}</span></div></div></header>
    <main className="w-full px-3 py-6 lg:px-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-cyan-700">PROJECT PLAN</p><h1 className="mt-1 text-3xl font-semibold">{year}년 {month}월 프로젝트 계획표</h1><p className="mt-1 text-sm text-slate-500">지난 일정은 숨기고 첨부 엑셀의 향후 계획과 새로 추가한 계획만 표시합니다.</p></div>{canEdit && <Button onClick={startCreate} className="bg-[#0c2340] hover:bg-[#16385f]"><Plus /> 계획 추가</Button>}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><div className="flex items-center rounded-md border bg-white"><Button variant="ghost" size="icon" onClick={() => moveMonth(-1)}><ChevronLeft /></Button><span className="min-w-28 text-center text-sm font-semibold">{year}년 {month}월</span><Button variant="ghost" size="icon" onClick={() => moveMonth(1)}><ChevronRight /></Button></div><select value={site} onChange={(event) => setSite(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value={ALL}>전체 사이트</option>{sites.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value={ALL}>전체 상태</option><option value="planned">계획</option><option value="active">진행중</option><option value="completed">완료</option></select><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="공사명·담당·작업내용 검색" className="w-72 bg-white" /><span className="self-center text-sm text-slate-500">총 {visible.length}건</span></div>
      <div className="overflow-auto rounded-xl border border-slate-300 bg-white shadow-sm"><table className="border-collapse text-xs" style={{ minWidth: 650 + dayCount * 34 }}><thead className="sticky top-0 z-30"><tr><th className="sticky left-0 z-40 w-[110px] min-w-[110px] border border-slate-300 bg-slate-100 px-2 py-3">사이트</th><th className="sticky left-[110px] z-40 w-[270px] min-w-[270px] border border-slate-300 bg-slate-100 px-2">프로젝트명</th><th className="sticky left-[380px] z-40 w-[80px] min-w-[80px] border border-slate-300 bg-slate-100 px-2">담당</th><th className="sticky left-[460px] z-40 w-[100px] min-w-[100px] border border-slate-300 bg-slate-100 px-2">안전등급</th><th className="sticky left-[560px] z-40 w-[90px] min-w-[90px] border border-slate-300 bg-slate-100 px-2">상태</th>{days.map((date) => { const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); const holiday = weekday === 0 || isKoreanPublicHoliday(date); return <th key={date} title={isKoreanPublicHoliday(date) ? "대한민국 공휴일" : undefined} className={`h-12 min-w-[34px] border border-slate-300 p-0 text-center ${holiday ? "bg-red-50 text-red-500" : weekday === 6 ? "bg-blue-50 text-blue-500" : "bg-slate-100 text-slate-600"}`}><span className="block text-[10px]">{Number(date.slice(8))}</span><span className="text-[9px]">{"일월화수목금토"[weekday]}</span></th>; })}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="h-14"><td className="sticky left-0 z-20 border border-slate-300 bg-white px-2 font-semibold">{item.siteName}</td><td className="sticky left-[110px] z-20 border border-slate-300 bg-white px-2"><button type="button" onClick={() => startEdit(item)} className={`line-clamp-2 w-full break-all text-left font-semibold leading-4 underline-offset-2 hover:underline ${riskColor(item.riskGrade)}`}>{item.projectName}</button><p className="mt-1 line-clamp-1 text-[10px] text-slate-500">{item.workDescription}</p></td><td className="sticky left-[380px] z-20 border border-slate-300 bg-white px-2 text-center">{item.managerName || "-"}</td><td className={`sticky left-[460px] z-20 border border-slate-300 bg-white px-2 text-center font-medium ${riskColor(item.riskGrade)}`}>{item.riskGrade}</td><td className="sticky left-[560px] z-20 border border-slate-300 bg-white px-2 text-center"><span className={`rounded-full px-2 py-1 ${statusStyle(item.status)}`}>{statusLabel(item.status)}</span></td>{days.map((date) => { const active = date >= item.startDate && date <= item.endDate; const labelDate = item.startDate < monthStart ? monthStart : item.startDate; const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); return <td key={date} className={`relative min-w-[34px] border border-slate-200 p-0 ${active ? item.riskGrade.startsWith("C급") ? "bg-red-200" : item.riskGrade.startsWith("D급") ? "bg-orange-200" : item.riskGrade.startsWith("사외") ? "bg-blue-200" : "bg-emerald-200" : weekday === 0 || isKoreanPublicHoliday(date) ? "bg-red-50" : weekday === 6 ? "bg-blue-50" : "bg-white"}`}>{active && date === labelDate && <span className="absolute left-1 top-1/2 z-10 w-72 -translate-y-1/2 truncate text-[10px] font-semibold text-slate-800">{item.projectName}</span>}</td>; })}</tr>)}{!visible.length && <tr><td colSpan={dayCount + 5} className="h-32 text-center text-slate-500">이 달에 예정된 프로젝트가 없습니다.</td></tr>}</tbody></table></div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span><i className="mr-1 inline-block size-3 rounded-sm bg-red-200" />C급</span><span><i className="mr-1 inline-block size-3 rounded-sm bg-orange-200" />D급</span><span><i className="mr-1 inline-block size-3 rounded-sm bg-emerald-200" />일반작업</span><span><i className="mr-1 inline-block size-3 rounded-sm bg-blue-200" />사외작업</span></div>
    </main>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? "계획" : "새 계획 추가"}</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "사이트·프로젝트명·담당·안전등급과 작업 기간을 입력합니다."
              : "프로젝트 계획과 안전대책을 확인합니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>사이트</Label><Input value={form.siteName} onChange={(event) => field("siteName", event.target.value)} placeholder="DSR" readOnly={!canEdit} /></div>
          <div><Label>프로젝트명</Label><Input value={form.projectName} onChange={(event) => field("projectName", event.target.value)} readOnly={!canEdit} /></div>
          <div><Label>담당(PM)</Label><Input value={form.managerName} onChange={(event) => field("managerName", event.target.value)} readOnly={!canEdit} /></div>
          <div><Label>업체명</Label><Input value={form.companyName} onChange={(event) => field("companyName", event.target.value)} readOnly={!canEdit} /></div>
          <div><Label>안전등급</Label><select value={form.riskGrade} onChange={(event) => field("riskGrade", event.target.value)} disabled={!canEdit} className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm disabled:cursor-default disabled:opacity-100"><option>일반작업</option><option>D급(고소작업)</option><option>C급(천장속 작업)</option><option>사외작업(천장속작업)</option></select></div>
          <div><Label>상태</Label><select value={form.status} onChange={(event) => field("status", event.target.value)} disabled={!canEdit} className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm disabled:cursor-default disabled:opacity-100"><option value="planned">계획</option><option value="active">진행중</option><option value="completed">완료</option></select></div>
          <div><Label>시작일</Label><Input type="date" value={form.startDate} onChange={(event) => field("startDate", event.target.value)} readOnly={!canEdit} /></div>
          <div><Label>종료일</Label><Input type="date" min={form.startDate} value={form.endDate} onChange={(event) => field("endDate", event.target.value)} readOnly={!canEdit} /></div>
          <div className="sm:col-span-2"><Label>안전대책</Label><Textarea value={form.workDescription} onChange={(event) => field("workDescription", event.target.value)} readOnly={!canEdit} rows={5} /></div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {canEdit ? (
          <div className="flex justify-between"><div>{editing && <Button variant="destructive" onClick={remove} disabled={saving}><Trash2 /> 삭제</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => setOpen(false)}><X /> 취소</Button><Button onClick={save} disabled={saving || !form.siteName || !form.projectName || !form.startDate || !form.endDate}><Save /> {saving ? "저장 중..." : "저장"}</Button></div></div>
        ) : (
          <div className="flex justify-end"><Button variant="outline" onClick={() => setOpen(false)}><X /> 닫기</Button></div>
        )}
      </DialogContent>
    </Dialog>
  </div>;
}
