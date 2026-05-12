import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  const session = cookieStore.get("admin_session_v3");

  if (!session || session.value !== "ok") {
    redirect("/admin/login");
  }

  return <>{children}</>;
}