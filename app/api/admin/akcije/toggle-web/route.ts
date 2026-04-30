import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function POST(req: Request) {
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