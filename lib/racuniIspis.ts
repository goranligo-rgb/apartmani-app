import { prisma } from "@/lib/prisma";

// Odabir i provjera računa za skupni ispis (/admin/racuni/ispis).
// Pregled i spajanje PDF-ova koriste isti odabir, da uvijek obrade iste račune.
//
// Broj računa postoji u dva formata (vidi generatore u lib/potvrdaNaplate.ts,
// app/[locale]/rezervacije/uspjeh/page.tsx i app/admin/rezervacije/[id]/page.tsx):
//   PREFIX-NNN-GODINA   npr. MARTY-039-2026
//   PREFIX-GODINA-NNNN  npr. MARTY-2026-0001
// Prefiks se namjerno ignorira jer se može promijeniti u postavkama — računi se
// biraju po objektId. Godina se čita iz broja, ne iz createdAt, jer se oko Nove
// godine te dvije vrijednosti mogu razlikovati.

export type FormatBroja = "PREFIX-NNN-GODINA" | "PREFIX-GODINA-NNNN";

export function izvuciRedniBroj(
  brojRacuna: string,
  godina: number
): { redni: number; format: FormatBroja } | null {
  const stari = brojRacuna.match(new RegExp(`^.+-(\\d+)-${godina}$`));
  if (stari) return { redni: Number(stari[1]), format: "PREFIX-NNN-GODINA" };

  const novi = brojRacuna.match(new RegExp(`^.+-${godina}-(\\d+)$`));
  if (novi) return { redni: Number(novi[1]), format: "PREFIX-GODINA-NNNN" };

  return null;
}

export type ParametriIspisa = {
  objektId: string;
  godina: number;
  odBroja: number;
  doBroja: number;
};

type SirovaVrijednost = string | string[] | null | undefined;

function prvaVrijednost(value: SirovaVrijednost) {
  return String((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

function pozitivanCijeliBroj(value: string) {
  if (!/^\d+$/.test(value)) return null;

  const broj = Number(value);
  return Number.isSafeInteger(broj) && broj > 0 ? broj : null;
}

export function procitajParametre(raw: {
  objekt?: SirovaVrijednost;
  godina?: SirovaVrijednost;
  od?: SirovaVrijednost;
  do?: SirovaVrijednost;
}):
  | { ok: true; parametri: ParametriIspisa }
  | { ok: false; greske: string[] } {
  const objektId = prvaVrijednost(raw.objekt);
  const godina = pozitivanCijeliBroj(prvaVrijednost(raw.godina));
  const odBroja = pozitivanCijeliBroj(prvaVrijednost(raw.od));
  const doBroja = pozitivanCijeliBroj(prvaVrijednost(raw.do));

  const greske: string[] = [];

  if (!objektId) greske.push("Odaberi objekt.");
  if (godina === null || godina < 2000 || godina > 2100) {
    greske.push("Godina nije ispravna.");
  }
  if (odBroja === null) greske.push("Broj „od” mora biti cijeli broj veći od 0.");
  if (doBroja === null) greske.push("Broj „do” mora biti cijeli broj veći od 0.");
  if (odBroja !== null && doBroja !== null && odBroja > doBroja) {
    greske.push("Broj „od” ne smije biti veći od broja „do”.");
  }

  if (greske.length > 0 || godina === null || odBroja === null || doBroja === null) {
    return { ok: false, greske };
  }

  return { ok: true, parametri: { objektId, godina, odBroja, doBroja } };
}

export type RacunUlaz = {
  id: string;
  brojRacuna: string;
  pdfUrl: string | null;
  iznos: number;
  valuta: string;
  createdAt: Date;
  gost: string;
  otkazanaRezervacija: boolean;
};

export type RacunZaIspis = RacunUlaz & {
  redni: number;
  format: FormatBroja;
};

export type AnalizaIspisa = {
  // Svi računi u rasponu, numerički sortirani (i oni bez PDF-a).
  racuni: RacunZaIspis[];
  // Podskup koji ulazi u spojeni PDF.
  zaSpajanje: RacunZaIspis[];
  // Preskaču se u spajanju i moraju biti jasno navedeni.
  bezPdf: RacunZaIspis[];
  // Brojevi koji fale između "od" i zadnjeg izdanog (ili "do", što je manje).
  rupe: number[];
  // Isti redni broj na više računa (npr. MARTY-001-2026 i MARTY-2026-0001).
  duplikati: { redni: number; brojevi: string[] }[];
  // Najveći redni broj objekta u godini, i izvan odabranog raspona.
  zadnjiIzdani: number | null;
  doVeciOdZadnjeg: boolean;
};

export function analizirajRacune(
  ulaz: RacunUlaz[],
  { godina, odBroja, doBroja }: Omit<ParametriIspisa, "objektId">
): AnalizaIspisa {
  const uGodini: RacunZaIspis[] = [];

  for (const racun of ulaz) {
    const izvuceno = izvuciRedniBroj(racun.brojRacuna, godina);
    if (izvuceno) uGodini.push({ ...racun, ...izvuceno });
  }

  const zadnjiIzdani =
    uGodini.length > 0 ? Math.max(...uGodini.map((r) => r.redni)) : null;

  const racuni = uGodini
    .filter((r) => r.redni >= odBroja && r.redni <= doBroja)
    .sort(
      (a, b) =>
        a.redni - b.redni ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.brojRacuna.localeCompare(b.brojRacuna)
    );

  const poRednom = new Map<number, string[]>();
  for (const racun of racuni) {
    poRednom.set(racun.redni, [
      ...(poRednom.get(racun.redni) ?? []),
      racun.brojRacuna,
    ]);
  }

  const rupe: number[] = [];
  if (zadnjiIzdani !== null) {
    // Gornja granica je zadnji izdani, pa golemi "do" ne stvara lažne rupe.
    for (let n = odBroja; n <= Math.min(doBroja, zadnjiIzdani); n++) {
      if (!poRednom.has(n)) rupe.push(n);
    }
  }

  const duplikati = [...poRednom.entries()]
    .filter(([, brojevi]) => brojevi.length > 1)
    .map(([redni, brojevi]) => ({ redni, brojevi }));

  return {
    racuni,
    zaSpajanje: racuni.filter((r) => r.pdfUrl),
    bezPdf: racuni.filter((r) => !r.pdfUrl),
    rupe,
    duplikati,
    zadnjiIzdani,
    doVeciOdZadnjeg: zadnjiIzdani !== null && doBroja > zadnjiIzdani,
  };
}

export async function dohvatiIspis(
  parametri: ParametriIspisa
): Promise<AnalizaIspisa> {
  const racuni = await prisma.racun.findMany({
    where: { objektId: parametri.objektId },
    select: {
      id: true,
      brojRacuna: true,
      pdfUrl: true,
      iznos: true,
      valuta: true,
      createdAt: true,
      rezervacija: {
        select: {
          status: true,
          gost: { select: { ime: true, prezime: true } },
        },
      },
    },
  });

  return analizirajRacune(
    racuni.map(({ rezervacija, ...racun }) => ({
      ...racun,
      gost: [rezervacija.gost?.ime, rezervacija.gost?.prezime]
        .filter(Boolean)
        .join(" "),
      otkazanaRezervacija: rezervacija.status === "OTKAZANO",
    })),
    parametri
  );
}
