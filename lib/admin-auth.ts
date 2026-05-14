import { cookies } from "next/headers";

// Provjerava admin session cookie postavljen u app/api/admin/login/route.ts.
// Vraća true ako je admin autoriziran.
//
// Koristi se u admin API route-ovima:
//   const ok = await adminSessionOk();
//   if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//
// Postojeći middleware (middleware.ts) štiti samo /admin/* UI stranice;
// /api/* rute prolaze slobodno. Ovaj helper je opt-in zaštita za nove
// admin API rute koje pišu osjetljive podatke (gostovi kontakti, iznosi).
export async function adminSessionOk(): Promise<boolean> {
  const c = await cookies();
  return c.get("admin_session_v3")?.value === "ok";
}
