import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatZagreb } from "@/lib/dates";
import { izvuciRedniBroj } from "@/lib/racuniIspis";

export const dynamic = "force-dynamic";

export default async function RacuniPage() {
  const godina = Number(
    formatZagreb(new Date(), { year: "numeric", locale: "en-GB" })
  );

  const [objekti, racuni] = await Promise.all([
    prisma.objekt.findMany({
      select: { id: true, naziv: true },
      orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
    }),
    prisma.racun.findMany({
      select: { objektId: true, brojRacuna: true },
    }),
  ]);

  // Forma nema client JS, pa se polje "do" ne može mijenjati s odabirom objekta.
  // Zato ostaje prazno, a zadnji izdani brojevi su navedeni ispod forme.
  const zadnjiPoObjektu = objekti.map((objekt) => {
    const redni = racuni
      .filter((r) => r.objektId === objekt.id)
      .map((r) => izvuciRedniBroj(r.brojRacuna, godina)?.redni ?? 0);

    return { ...objekt, zadnji: Math.max(0, ...redni) };
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
      <div className="mx-auto max-w-3xl text-[#2e2923]">
        <section className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">Skupni ispis računa</h1>

          <p className="mt-2 text-[#6f665a]">
            Odaberi objekt, godinu i raspon brojeva. Prije ispisa dobiješ pregled
            računa i upozorenja, a zatim sve otvaraš kao jedan PDF.
          </p>
        </section>

        <form
          method="get"
          action="/admin/racuni/ispis"
          className="border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Objekt">
                <select name="objekt" required className="input">
                  {objekti.map((objekt) => (
                    <option key={objekt.id} value={objekt.id}>
                      {objekt.naziv}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Godina">
                <input
                  name="godina"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  defaultValue={godina}
                  required
                  className="input"
                />
              </Field>
            </div>

            <Field label="Od broja">
              <input
                name="od"
                type="number"
                min={1}
                step={1}
                defaultValue={1}
                required
                className="input"
              />
            </Field>

            <Field label="Do broja">
              <input
                name="do"
                type="number"
                min={1}
                step={1}
                required
                className="input"
              />
            </Field>
          </div>

          <div className="mt-5 border border-[#e2d8c8] bg-[#fcfaf6] p-4 text-sm text-[#6f665a]">
            <p className="font-black text-[#2e2923]">
              Zadnji izdani broj u {godina}.
            </p>

            <ul className="mt-2 space-y-1">
              {zadnjiPoObjektu.map((objekt) => (
                <li key={objekt.id}>
                  {objekt.naziv}:{" "}
                  <b>{objekt.zadnji > 0 ? objekt.zadnji : "nema računa"}</b>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            className="mt-5 w-full cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:brightness-95"
          >
            Prikaži pregled
          </button>
        </form>
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
        {label}
      </span>

      {children}
    </label>
  );
}
