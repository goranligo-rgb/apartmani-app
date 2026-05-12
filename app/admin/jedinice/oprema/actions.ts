"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function spremiOpremuJedinice(formData: FormData) {
  const jedinicaId = String(formData.get("jedinicaId") || "");

  if (!jedinicaId) {
    throw new Error("Nedostaje jedinica.");
  }

  const opremaIds = formData.getAll("opremaIds").map(String);
  const uniqueOpremaIds = Array.from(new Set(opremaIds));

  await prisma.jedinicaOprema.deleteMany({
    where: {
      jedinicaId,
    },
  });

  if (uniqueOpremaIds.length > 0) {
    await prisma.jedinicaOprema.createMany({
      data: uniqueOpremaIds.map((opremaId) => ({
        jedinicaId,
        opremaId,
      })),
    });
  }

  redirect(`/admin/jedinice/oprema?jedinicaId=${jedinicaId}&saved=1`);
}