import { getChatGPTUser } from "@/app/chatgpt-auth";
import { LaborDashboard } from "./labor-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getChatGPTUser();
  return <LaborDashboard displayName={user?.displayName ?? "사내 사용자"} />;
}
