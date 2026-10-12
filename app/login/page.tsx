"use client";

import { FormEvent, useState } from "react";
import { Calculator, LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const params = useSearchParams();
  const [loginId, setLoginId] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await response.json().catch(() => ({ error: "로그인 서버에서 올바른 응답을 받지 못했습니다." })) as { error?: string; mustChangePassword?: boolean };
      if (!response.ok) {
        setError(data.error || "로그인하지 못했습니다.");
        return;
      }
      const requested = params.get("return_to");
      const safe = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      window.location.href = data.mustChangePassword ? "/change-password" : safe;
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#071a31] px-5"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"><div className="mx-auto grid size-12 place-items-center rounded-xl bg-cyan-400 text-[#0c2340]"><Calculator /></div><h1 className="mt-5 text-center text-2xl font-semibold">관리자 로그인</h1><p className="mt-2 text-center text-sm text-slate-500">관리자 아이디와 비밀번호를 입력하세요.</p><div className="mt-7 space-y-4"><div className="space-y-2"><Label htmlFor="loginId">아이디</Label><Input id="loginId" autoComplete="username" value={loginId} onChange={(event) => setLoginId(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{error && <p className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={loading}><LogIn />{loading ? "확인 중..." : "관리자 로그인"}</Button></div></form></main>;
}
