import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { spremiPostavkeRacuna } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  saved?: string;
}>;

function defaultPrefix(naziv: string) {
  if (naziv.toLowerCase().includes("marty")) return "MARTY";
  if (naziv.toLowerCase().includes("eva")) return "EVA";
  if (naziv.toLowerCase().includes("art")) return "ART";
  return "RAC";
}

function defaultNapomena() {
  return "Privatni iznajmljivač nije u sustavu PDV-a. PDV nije obračunat.";
}

export default async function PostavkeRacunaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const saved = params.saved === "1";

  const objekti = await prisma.objekt.findMany({
    orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
  });

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, #2dd4bf 0%, transparent 28%), radial-gradient(circle at top right, #7c3aed 0%, transparent 32%), linear-gradient(135deg, #060816 0%, #0b1024 45%, #120818 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-white">
        <section className="mb-6 border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <Link href="/admin" className="text-sm font-black text-cyan-200">
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">Postavke računa</h1>

          <p className="mt-2 max-w-3xl text-slate-300">
            Ovdje upisuješ podatke izdavatelja računa za svaki objekt. PDF račun
            automatski uzima ove podatke, podatke gosta i podatke rezervacije.
          </p>
        </section>

        {saved && (
          <div className="mb-6 border border-emerald-300/40 bg-emerald-400/15 p-4 text-sm font-black text-emerald-100">
            ✅ Postavke računa su spremljene.
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          {objekti.map((objekt) => {
            const prefix = objekt.prefixRacuna || defaultPrefix(objekt.naziv);
            const napomena = objekt.napomenaNaRacunu || defaultNapomena();

            return (
              <form
                key={objekt.id}
                action={spremiPostavkeRacuna}
                className="border border-white/15 bg-white/10 p-5 shadow-[0_20px_65px_rgba(0,0,0,0.38)] backdrop-blur-xl"
              >
                <input type="hidden" name="objektId" value={objekt.id} />

                <div className="mb-5 border-b border-white/10 pb-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                    Objekt
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-white">
                    {objekt.naziv}
                  </h2>

                  <p className="mt-1 text-sm text-slate-300">
                    Ovi podaci ulaze u PDF račun.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Izdavatelj računa
                    </span>
                    <input
                      name="nazivZaRacun"
                      defaultValue={objekt.nazivZaRacun || ""}
                      placeholder="npr. Blažica Kostanjevec"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      OIB
                    </span>
                    <input
                      name="oibZaRacun"
                      defaultValue={objekt.oibZaRacun || ""}
                      placeholder="OIB iznajmljivača"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Adresa
                    </span>
                    <input
                      name="adresaZaRacun"
                      defaultValue={objekt.adresaZaRacun || ""}
                      placeholder="npr. Braće Turčić 25a"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Mjesto
                    </span>
                    <input
                      name="mjestoZaRacun"
                      defaultValue={objekt.mjestoZaRacun || objekt.mjesto || ""}
                      placeholder="npr. Malinska"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Telefon
                    </span>
                    <input
                      name="telefonZaRacun"
                      defaultValue={objekt.telefonZaRacun || ""}
                      placeholder="npr. 098 700 415"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Email izdavatelja
                    </span>
                    <input
                      name="emailZaRacun"
                      defaultValue={objekt.emailZaRacun || ""}
                      placeholder="npr. info@malinska-stay.hr"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      CC mail za račune
                    </span>
                    <input
                      name="ccEmailZaRacun"
                      defaultValue={objekt.ccEmailZaRacun || ""}
                      placeholder="npr. goran.ligo@gmail.com, info@malinska-stay.hr"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Na ove mailove dolazi kopija svakog poslanog računa.
                      Više mailova odvoji zarezom.
                    </p>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      IBAN
                    </span>
                    <input
                      name="ibanZaRacun"
                      defaultValue={objekt.ibanZaRacun || ""}
                      placeholder="IBAN ako ga želiš prikazati na računu"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Prefiks računa
                    </span>
                    <input
                      name="prefixRacuna"
                      defaultValue={prefix}
                      placeholder="MARTY / EVA / ART"
                      className="w-full border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold uppercase text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Primjer broja: {prefix}-001-2026
                    </p>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                      Napomena na računu
                    </span>
                    <textarea
                      name="napomenaNaRacunu"
                      defaultValue={napomena}
                      rows={4}
                      className="w-full resize-none border border-white/15 bg-black/25 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="mt-5 w-full border border-cyan-300 bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-white"
                >
                  Spremi postavke
                </button>
              </form>
            );
          })}
        </section>

        <section className="mt-8 border border-white/15 bg-white/10 p-5 text-sm leading-6 text-slate-300 backdrop-blur-xl">
          <p className="font-black text-white">Napomena:</p>
          <p className="mt-2">
            Za privatne iznajmljivače ne radimo fiskalizaciju u ovoj fazi.
            Račun se izrađuje kao PDF račun s podacima iznajmljivača,
            rezervacije i gosta. Tekst porezne napomene ostavljamo kao polje
            koje se može upisati posebno za svaki objekt.
          </p>
        </section>
      </div>
    </main>
  );
}