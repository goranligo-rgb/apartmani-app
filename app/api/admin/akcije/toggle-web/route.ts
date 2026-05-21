import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { adminSessionOk } from "@/lib/admin-auth";

export async function POST(req: Request) {
  // Admin auth gate — bez sesije ne dozvoli toggle web vidljivosti akcija.
  if (!(await adminSessionOk())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const id = String(formData.get("id") || "");

  if (!id) {
    redirect("/admin/akcije");
  }

  const akcija = await prisma.akcija.findUnique({
    where: { id },
    select: { prikaziNaWebu: true },
  });

  if (!akcija) {
    redirect("/admin/akcije");
  }

  await prisma.akcija.update({
    where: { id },
    data: {
      prikaziNaWebu: !akcija.prikaziNaWebu,
    },
  });

  redirect("/admin/akcije");
}