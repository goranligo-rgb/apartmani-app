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
          "linear-gradient(180deg, #f4f1ec 0%, #eee8df 48%, #e7dfd3 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-[#2e2923]">
        <section className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          {saved && (
            <div className="mb-6 border border-green-300 bg-green-50 p-4 text-green-800 shadow">
              <div className="text-sm font-black uppercase tracking-[0.14em]">
                ✔ Postavke računa spremljene
              </div>
            </div>
          )}

          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">Postavke računa</h1>

          <p className="mt-2 max-w-3xl text-[#6f665a]">
            Ovdje upisuješ podatke izdavatelja računa za svaki objekt. PDF račun
            automatski uzima ove podatke, podatke gosta i podatke rezervacije.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {objekti.map((objekt) => {
            const prefix = objekt.prefixRacuna || defaultPrefix(objekt.naziv);
            const napomena = objekt.napomenaNaRacunu || defaultNapomena();

            return (
              <form
                key={objekt.id}
                action={spremiPostavkeRacuna}
                className="border border-white/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.08)]"
              >
                <input type="hidden" name="objektId" value={objekt.id} />

                <div className="mb-5 border-b border-[#e2d8c8] pb-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                    Objekt
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-[#2e2923]">
                    {objekt.naziv}
                  </h2>

                  <p className="mt-1 text-sm text-[#6f665a]">
                    Ovi podaci ulaze u PDF račun.
                  </p>
                </div>

                <div className="space-y-4">
                  <Field label="Izdavatelj računa">
                    <input
                      name="nazivZaRacun"
                      defaultValue={objekt.nazivZaRacun || ""}
                      placeholder="npr. Blažica Kostanjevec"
                      className="input"
                    />
                  </Field>

                  <Field label="OIB">
                    <input
                      name="oibZaRacun"
                      defaultValue={objekt.oibZaRacun || ""}
                      placeholder="OIB iznajmljivača"
                      className="input"
                    />
                  </Field>

                  <Field label="Adresa">
                    <input
                      name="adresaZaRacun"
                      defaultValue={objekt.adresaZaRacun || ""}
                      placeholder="npr. Braće Turčić 25a"
                      className="input"
                    />
                  </Field>

                  <Field label="Mjesto">
                    <input
                      name="mjestoZaRacun"
                      defaultValue={objekt.mjestoZaRacun || objekt.mjesto || ""}
                      placeholder="npr. Malinska"
                      className="input"
                    />
                  </Field>

                  <Field label="Telefon">
                    <input
                      name="telefonZaRacun"
                      defaultValue={objekt.telefonZaRacun || ""}
                      placeholder="npr. 098 700 415"
                      className="input"
                    />
                  </Field>

                  <Field label="Email izdavatelja">
                    <input
                      name="emailZaRacun"
                      defaultValue={objekt.emailZaRacun || ""}
                      placeholder="npr. rezervacije@malinska-stay.hr"
                      className="input"
                    />
                  </Field>

                  <Field
                    label="CC mail za račune"
                    help="Na ove mailove dolazi kopija svakog poslanog računa. Više mailova odvoji zarezom."
                  >
                    <input
                      name="ccEmailZaRacun"
                      defaultValue={objekt.ccEmailZaRacun || ""}
                      placeholder="goran@gmail.com, rezervacije@malinska-stay.hr"
                      className="input"
                    />
                  </Field>

                  <Field label="IBAN">
                    <input
                      name="ibanZaRacun"
                      defaultValue={objekt.ibanZaRacun || ""}
                      placeholder="IBAN ako ga želiš prikazati na računu"
                      className="input"
                    />
                  </Field>

                  <Field
                    label="Prefiks računa"
                    help={`Primjer broja: ${prefix}-001-2026`}
                  >
                    <input
                      name="prefixRacuna"
                      defaultValue={prefix}
                      placeholder="MARTY / EVA / ART"
                      className="input uppercase"
                    />
                  </Field>

                  <Field label="Napomena na računu">
                    <textarea
                      name="napomenaNaRacunu"
                      defaultValue={napomena}
                      rows={4}
                      className="input resize-none"
                    />
                  </Field>
                </div>

                <button
                  type="submit"
                  className="mt-5 w-full cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:brightness-95"
                >
                  Spremi postavke
                </button>
              </form>
            );
          })}
        </section>

        <section className="mt-8 border border-[#ead7b6] bg-[#fff9ef] p-5 text-sm leading-6 text-[#7a5a22] shadow-[0_14px_35px_rgba(0,0,0,0.06)]">
          <p className="font-black text-[#2e2923]">Napomena:</p>
          <p className="mt-2">
            Za privatne iznajmljivače ne radimo fiskalizaciju u ovoj fazi.
            Račun se izrađuje kao PDF račun s podacima iznajmljivača,
            rezervacije i gosta. Tekst porezne napomene ostaje kao polje koje se
            može upisati posebno za svaki objekt.
          </p>
        </section>
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid #d8c8aa;
          background: #ffffff;
          padding: 12px;
          color: #2e2923;
          outline: none;
          font-size: 14px;
          font-weight: 700;
        }

        .input::placeholder {
          color: #a89b88;
          font-weight: 600;
        }

        .input:focus {
          border-color: #c79a57;
          box-shadow: 0 0 0 3px rgba(199, 154, 87, 0.16);
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
        {label}
      </span>

      {children}

      {help && <p className="mt-1 text-xs text-[#6f665a]">{help}</p>}
    </label>
  );
}