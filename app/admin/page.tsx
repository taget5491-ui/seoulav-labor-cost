import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/password-auth";
import { UserAdmin } from "./user-admin";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await requireSessionUser("/admin");
  if (!user || user.role !== "admin") redirect("/");
  return <UserAdmin currentEmail={user.email} />;
}
