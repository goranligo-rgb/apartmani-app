"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function obrisiTestRezervacije(formData: FormData) {
  const potvrda = String(formData.get("potvrda") || "")
    .trim()
    .toUpperCase();

  if (potvrda !== "BRISI TEST") {
    throw new Error("Za potvrdu morate upisati BRISI TEST.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailLog.deleteMany({});
    await tx.rezervacijaPromjena.deleteMany({});
    await tx.racun.deleteMany({});
    await tx.placanje.deleteMany({});

    await tx.zadatak.deleteMany({
      where: {
        rezervacijaId: {
          not: null,
        },
      },
    });

    await tx.rezervacija.deleteMany({});
    await tx.gost.deleteMany({});
  });

  revalidatePath("/admin");
  revalidatePath("/admin/rezervacije");
  revalidatePath("/admin/monitor");
  revalidatePath("/admin/gosti");

  redirect("/admin?rezervacijeObrisane=1");
}