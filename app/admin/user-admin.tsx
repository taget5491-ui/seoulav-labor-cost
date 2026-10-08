"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ManagedUser = { email: string; displayName: string; role: "admin" | "user"; active: boolean; updatedAt: string };

export function UserAdmin({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const response = await fetch("/api/users", { cache: "no-store" }); const data = await response.json() as { users?: ManagedUser[]; error?: string }; if (response.ok) setUsers(data.users ?? []); else toast.error(data.error); setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function save(next: { email: string; password?: string; role: "admin" | "user"; active: boolean }) { const response = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }); const data = await response.json() as { error?: string }; if (!response.ok) return toast.error(data.error || "저장하지 못했습니다."); toast.success("사용자 계정을 저장했습니다."); setEmail(""); setPassword(""); await load(); }
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-cyan-700">ACCESS CONTROL</p><h1 className="text-2xl font-semibold">사용자 권한 관리</h1><p className="mt-1 text-sm text-slate-500">로그인 아이디, 임시 비밀번호와 권한을 관리합니다.</p></div><a href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" />산정 화면</a></div><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="size-4" />사용자 추가</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="로그인 아이디 (영문/숫자)" /><Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="임시 비밀번호 10자 이상" type="password" /><Button onClick={() => void save({ email, password, role: "user", active: true })} disabled={!email.trim() || password.length < 10}>사용자 추가</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" />등록 계정</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>아이디</TableHead><TableHead>표시 이름</TableHead><TableHead>권한</TableHead><TableHead>활성</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.email}><TableCell className="font-medium">{user.email}{user.email === currentEmail && <span className="ml-2 text-xs text-cyan-700">현재 계정</span>}</TableCell><TableCell>{user.displayName}</TableCell><TableCell><Select value={user.role} disabled={user.email === currentEmail} onValueChange={(role) => void save({ email: user.email, role: role as "admin" | "user", active: user.active })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">관리자</SelectItem><SelectItem value="user">사용자</SelectItem></SelectContent></Select></TableCell><TableCell><label className="flex items-center gap-2"><Checkbox checked={user.active} disabled={user.email === currentEmail} onCheckedChange={(active) => void save({ email: user.email, role: user.role, active: active === true })} /><span className="text-sm">{user.active ? "사용" : "중지"}</span></label></TableCell></TableRow>)}{!loading && !users.length && <TableRow><TableCell colSpan={4} className="h-28 text-center text-slate-500">등록된 계정이 없습니다.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div></main>;
}
