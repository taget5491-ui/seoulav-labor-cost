import { ShieldAlert } from "lucide-react";

export default function AccessDeniedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900">사용이 중지된 계정입니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          관리자에게 계정 활성화를 요청해 주세요. 다른 ChatGPT 계정으로 접속하려면 아래 버튼을 이용하세요.
        </p>
        <a href="/login" className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#0c2340] px-5 text-sm font-medium text-white hover:bg-[#16385f]">
          로그아웃
        </a>
      </section>
    </main>
  );
}
