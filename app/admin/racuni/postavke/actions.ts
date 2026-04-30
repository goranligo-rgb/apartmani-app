"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function spremiPostavkeRacuna(formData: FormData) {
  const objektId = String(formData.get("objektId") || "");

  if (!objektId) {
    throw new Error("Nedostaje objekt.");
  }

  const nazivZaRacun = String(formData.get("nazivZaRacun") || "").trim();
  const oibZaRacun = String(formData.get("oibZaRacun") || "").trim();
  const adresaZaRacun = String(formData.get("adresaZaRacun") || "").trim();
  const mjestoZaRacun = String(formData.get("mjestoZaRacun") || "").trim();
  const ibanZaRacun = String(formData.get("ibanZaRacun") || "").trim();
  const emailZaRacun = String(formData.get("emailZaRacun") || "").trim();
  const ccEmailZaRacun = String(formData.get("ccEmailZaRacun") || "").trim();
  const telefonZaRacun = String(formData.get("telefonZaRacun") || "").trim();
  const prefixRacuna = String(formData.get("prefixRacuna") || "").trim();
  const napomenaNaRacunu = String(formData.get("napomenaNaRacunu") || "").trim();

  await prisma.objekt.update({
    where: {
      id: objektId,
    },
    data: {
      nazivZaRacun: nazivZaRacun || null,
      oibZaRacun: oibZaRacun || null,
      adresaZaRacun: adresaZaRacun || null,
      mjestoZaRacun: mjestoZaRacun || null,
      ibanZaRacun: ibanZaRacun || null,
      emailZaRacun: emailZaRacun || null,
      ccEmailZaRacun: ccEmailZaRacun || null,
      telefonZaRacun: telefonZaRacun || null,
      prefixRacuna: prefixRacuna || null,
      napomenaNaRacunu: napomenaNaRacunu || null,
    },
  });

  revalidatePath("/admin/racuni/postavke");
  redirect("/admin/racuni/postavke?saved=1");
}