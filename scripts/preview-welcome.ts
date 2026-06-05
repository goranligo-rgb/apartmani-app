// Generira preview welcome maila iz personalizirane welcome stranice
// (fetch /welcome/{slug}?t={rezervacijaId} + mehanička obrada). Dev server mora
// raditi na appUrl.
//   npx tsx scripts/preview-welcome.ts            → eva (tmp/pregled-welcome-mail.html)
//   npx tsx scripts/preview-welcome.ts marty      → tmp/pregled-welcome-marty.html
//   npx tsx scripts/preview-welcome.ts house-art  → tmp/pregled-welcome-house-art.html
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { welcomeMailFromPage } from "@/lib/vodic/mailFromPage";
import type { ObjektSlug } from "@/lib/objekti";

const appUrl = "http://localhost:3000";

// slug → točan Objekt.naziv u bazi (seed) + izlazna datoteka.
const OBJEKT_NAZIV: Record<ObjektSlug, string> = {
  eva: "Apartments Eva",
  marty: "Luxury Apartments Marty",
  "house-art": "House Art",
};
const IZLAZ: Record<ObjektSlug, string> = {
  eva: "tmp/pregled-welcome-mail.html",
  marty: "tmp/pregled-welcome-marty.html",
  "house-art": "tmp/pregled-welcome-house-art.html",
};

async function main() {
  const slug = (process.argv[2] as ObjektSlug) || "eva";
  if (!OBJEKT_NAZIV[slug]) {
    throw new Error(`Nepoznat slug: ${slug} (eva | marty | house-art)`);
  }

  // Rezervacija sa šifrom (za personalizaciju ?t=). Ako je nema → opća stranica.
  const r = await prisma.rezervacija.findFirst({
    where: {
      jedinica: { objekt: { naziv: OBJEKT_NAZIV[slug] } },
      ttlockSifre: { some: {} },
    },
    orderBy: { createdAt: "desc" },
  });

  // Za preview: ako testna rezervacija nema eCheckin link, postavi ga da se vidi
  // red "Molimo popunite prijavu prije dolaska: {link}". Stranica čita link iz
  // baze, pa ga ovdje (dev) postavljamo samo ako je prazan — bez prepisivanja.
  if (r && !r.eCheckinLink) {
    await prisma.rezervacija.update({
      where: { id: r.id },
      data: { eCheckinLink: "https://echeckin.example/abc" },
    });
  }

  const html = await welcomeMailFromPage({
    appUrl,
    slug,
    jezik: "hr",
    t: r?.id ?? null,
  });

  writeFileSync(IZLAZ[slug], html, "utf8");
  console.log(
    `Zapisano ${IZLAZ[slug]} (${html.length} zn.) | rez: ${r?.id ?? "(nema — opća stranica)"}`
  );
}

main().then(() => process.exit(0));
