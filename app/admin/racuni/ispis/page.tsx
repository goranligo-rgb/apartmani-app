import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatZagreb } from "@/lib/dates";
import { dohvatiIspis, procitajParametre } from "@/lib/racuniIspis";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// [5, 7, 8, 9] -> "5, 7–9"
function formatRupe(rupe: number[]) {
  const dijelovi: string[] = [];
  let i = 0;

  while (i < rupe.length) {
    let kraj = i;
    while (rupe[kraj + 1] === rupe[kraj] + 1) kraj++;

    dijelovi.push(
      kraj === i ? String(rupe[i]) : `${rupe[i]}–${rupe[kraj]}`
    );
    i = kraj + 1;
  }

  return dijelovi.join(", ");
}

export default async function IspisRacunaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const procitano = procitajParametre(await searchParams);

  if (!procitano.ok) {
    return (
      <Okvir>
        <Greske greske={procitano.greske} />
      </Okvir>
    );
  }

  const { parametri } = procitano;

  const objekt = await prisma.objekt.findUnique({
    where: { id: parametri.objektId },
    select: { naziv: true },
  });

  if (!objekt) {
    return (
      <Okvir>
        <Greske greske={["Odabrani objekt nije pronađen."]} />
      </Okvir>
    );
  }

  const analiza = await dohvatiIspis(parametri);
  const { godina, odBroja, doBroja } = parametri;

  const upozorenja: string[] = [];

  if (analiza.rupe.length > 0) {
    upozorenja.push(`U rasponu fale brojevi: ${formatRupe(analiza.rupe)}.`);
  }
  if (analiza.doVeciOdZadnjeg) {
    upozorenja.push(
      `Traženi „do” je ${doBroja}, a zadnji izdani broj u ${godina}. je ${analiza.zadnjiIzdani}.`
    );
  }
  for (const { redni, brojevi } of analiza.duplikati) {
    upozorenja.push(
      `Redni broj ${redni} postoji više puta: ${brojevi.join(", ")}. Ispisuju se svi, od starijeg prema novijem.`
    );
  }
  if (analiza.bezPdf.length > 0) {
    upozorenja.push(
      `Ne ulaze u PDF jer nemaju PDF datoteku: ${analiza.bezPdf
        .map((r) => r.brojRacuna)
        .join(", ")}.`
    );
  }

  return (
    <Okvir>
      <section className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
          {objekt.naziv} · {godina}. · brojevi {odBroja}–{doBroja}
        </p>

        <p className="mt-2 text-2xl font-black">
          Računa u rasponu: {analiza.racuni.length}, ulazi u PDF:{" "}
          {analiza.zaSpajanje.length}
        </p>

        {analiza.zaSpajanje.length > 0 && (
          // POST, a ne link: svaki klik stvara novu datoteku u bucketu, a Next
          // bi običan <Link> mogao dohvatiti unaprijed.
          <form
            method="post"
            action="/admin/racuni/ispis/pdf"
            target="_blank"
            className="mt-4"
          >
            <input type="hidden" name="objekt" value={parametri.objektId} />
            <input type="hidden" name="godina" value={godina} />
            <input type="hidden" name="od" value={odBroja} />
            <input type="hidden" name="do" value={doBroja} />

            <button
              type="submit"
              className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:brightness-95"
            >
              Otvori PDF ({analiza.zaSpajanje.length})
            </button>
          </form>
        )}
      </section>

      {upozorenja.length > 0 && (
        <section className="mb-6 border border-[#ead7b6] bg-[#fff9ef] p-5 text-sm leading-6 text-[#7a5a22] shadow-[0_14px_35px_rgba(0,0,0,0.06)]">
          <p className="font-black text-[#2e2923]">⚠ Upozorenja</p>

          <ul className="mt-2 list-disc space-y-1 pl-5">
            {upozorenja.map((upozorenje) => (
              <li key={upozorenje}>{upozorenje}</li>
            ))}
          </ul>
        </section>
      )}

      {analiza.racuni.length === 0 ? (
        <Greske greske={["U odabranom rasponu nema računa."]} />
      ) : (
        <section className="overflow-x-auto border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e2d8c8] text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
                <th className="py-2 pr-4">Rbr.</th>
                <th className="py-2 pr-4">Broj računa</th>
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Gost</th>
                <th className="py-2 pr-4 text-right">Iznos</th>
                <th className="py-2">Oznake</th>
              </tr>
            </thead>

            <tbody>
              {analiza.racuni.map((racun) => (
                <tr key={racun.id} className="border-b border-[#f0e8da]">
                  <td className="py-2 pr-4 font-black">{racun.redni}</td>
                  <td className="py-2 pr-4">{racun.brojRacuna}</td>
                  <td className="py-2 pr-4">
                    {formatZagreb(racun.createdAt, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2 pr-4">{racun.gost || "-"}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right">
                    {racun.iznos.toFixed(2)} {racun.valuta}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {racun.otkazanaRezervacija && (
                        <Oznaka>otkazana rezervacija</Oznaka>
                      )}
                      {!racun.pdfUrl && <Oznaka>bez PDF-a</Oznaka>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Okvir>
  );
}

function Okvir({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f4f1ec 0%, #eee8df 48%, #e7dfd3 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl text-[#2e2923]">
        <section className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin/racuni"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Odabir računa
          </Link>

          <h1 className="mt-4 text-4xl font-black">Pregled skupnog ispisa</h1>
        </section>

        {children}
      </div>
    </main>
  );
}

function Greske({ greske }: { greske: string[] }) {
  return (
    <section className="border border-red-300 bg-red-50 p-5 text-sm leading-6 text-red-800 shadow">
      <ul className="space-y-1 font-black">
        {greske.map((greska) => (
          <li key={greska}>{greska}</li>
        ))}
      </ul>
    </section>
  );
}

function Oznaka({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-black text-red-800">
      {children}
    </span>
  );
}
