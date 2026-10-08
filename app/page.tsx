import { redirect } from "next/navigation";
import { LaborCostApp } from "./labor-cost-app";
import { requireSessionUser } from "@/lib/password-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireSessionUser("/");
  if (!user.active) redirect("/access-denied");
  if (!user.canEdit) redirect("/dashboard");
  return <LaborCostApp displayName={user.displayName} isAdmin={user.role === "admin"} />;
}
