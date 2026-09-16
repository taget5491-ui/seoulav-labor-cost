import { getChatGPTUser } from "./chatgpt-auth";
import { LaborCostApp } from "./labor-cost-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <LaborCostApp displayName={user?.displayName ?? "사내 사용자"} />;
}
