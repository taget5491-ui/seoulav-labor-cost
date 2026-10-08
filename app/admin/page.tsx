import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureAppUser } from "@/lib/app-users";
import { UserAdmin } from "./user-admin";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const identity = await requireChatGPTUser("/admin");
  const user = await ensureAppUser(identity);
  if (!user || user.role !== "admin") redirect("/");
  return <UserAdmin currentEmail={user.email} />;
}
