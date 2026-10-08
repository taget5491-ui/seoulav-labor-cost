"use client";
import { LogOut } from "lucide-react";
export function LogoutButton() { async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; } return <button type="button" onClick={() => void logout()} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"><LogOut className="size-4" /> 로그아웃</button>; }
