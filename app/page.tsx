import { redirect } from "next/navigation";
import { requireChatGPTUser } from "./chatgpt-auth";
import { LaborCostApp } from "./labor-cost-app";
import { ensureAppUser } from "@/lib/app-users";

export const dynamic = "force-dynamic";

export default async function Home() {
  const identity = await requireChatGPTUser("/");
  const user = await ensureAppUser(identity);
  if (!user) redirect("/access-denied");
  return <LaborCostApp displayName={user.displayName} isAdmin={user.role === "admin"} />;
}
