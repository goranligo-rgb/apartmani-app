import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type SearchParams = Promise<{
  jedinicaId?: string;
  datumOd?: string;
  datumDo?: string;
  iznosUkupno?: string;
  ime?: string;
  prezime?: string;
  email?: string;
  telefon?: string;
  adresa?: string;
  grad?: string;
  drzava?: string;
  brojOsoba?: string;
  napomena?: string;
}>;

const DRZAVE = [
  "Hrvatska",
  "Slovenija",
  "Austrija",
  "Njemačka",
  "Italija",
  "Mađarska",
  "Češka",
  "Slovačka",
  "Poljska",
  "Nizozemska",
  "Belgija",
  "Francuska",
  "Švicarska",
  "Bosna i Hercegovina",
  "Srbija",
  "Crna Gora",
  "Sjeverna Makedonija",
  "Danska",
  "Švedska",
  "Norveška",
  "Finska",
  "Ujedinjeno Kraljevstvo",
  "Irska",
  "Španjolska",
  "Portugal",
  "Sjedinjene Američke Države",
  "Kanada",
  "Australija",
];

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("Neispravan datum.");
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export default async function NovaRezervacijaPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;

  const defaultDatumOd = searchParams.datumOd || "";
  const defaultDatumDo = searchParams.datumDo || "";
  const defaultIznosUkupno = searchParams.iznosUkupno || "0";

  const jedinice = await prisma.jedinica.findMany({
    include: { objekt: true },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  async function createReservation(formData: FormData) {
    "use server";

    const jedinicaId = String(formData.get("jedinicaId") || "");
    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();
    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();
    const datumOd = String(formData.get("datumOd") || "");
    const datumDo = String(formData.get("datumDo") || "");
    const brojOsoba = Number(formData.get("brojOsoba") || 1);
    const iznosUkupno = Number(formData.get("iznosUkupno") || 0);
    const napomena = String(formData.get("napomena") || "").trim();

    if (
      !jedinicaId ||
      !ime ||
      !prezime ||
      !email ||
      !telefon ||
      !adresa ||
      !grad ||
      !drzava ||
      !datumOd ||
      !datumDo ||
      !iznosUkupno
    ) {
      throw new Error("Nedostaju obavezna polja.");
    }

    const od = parseDateOnly(datumOd);
    const doDatuma = parseDateOnly(datumDo);

    if (od >= doDatuma) {
      throw new Error("Datum odlaska mora biti nakon dolaska.");
    }

    const brojNocenja = Math.ceil(
      (doDatuma.getTime() - od.getTime()) / 86400000
    );

    const postojiPreklapanje = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId,
        status: {
          not: "OTKAZANO",
        },
        datumOd: {
          lt: doDatuma,
        },
        datumDo: {
          gt: od,
        },
      },
    });

    if (postojiPreklapanje) {
      throw new Error("Termin je već zauzet.");
    }

    const params = new URLSearchParams({
      jedinicaId,
      ime,
      prezime,
      email,
      telefon,
      adresa,
      grad,
      drzava,
      datumOd,
      datumDo,
      brojOsoba: String(brojOsoba),
      brojNocenja: String(brojNocenja),
      iznosUkupno: String(iznosUkupno),
      napomena,
    });

    redirect(`/rezervacije/pregled?${params.toString()}`);
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-3xl border border-white/70 bg-white p-8 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
        <h1 className="text-3xl font-bold text-[#2e2923]">Nova rezervacija</h1>

        <p className="mt-2 text-[#6f665a]">
          Unesi podatke gosta. Sva polja za gosta su obavezna za potvrdu
          rezervacije.
        </p>

        <form action={createReservation} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              Jedinica
            </label>

            <select
              name="jedinicaId"
              defaultValue={searchParams.jedinicaId || ""}
              className="w-full cursor-pointer border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
              required
            >
              <option value="">Odaberi jedinicu</option>
              {jedinice.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.objekt.naziv} — {j.naziv}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Datum dolaska
              </label>

              <input
                name="datumOd"
                type="date"
                defaultValue={defaultDatumOd}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Datum odlaska
              </label>

              <input
                name="datumDo"
                type="date"
                defaultValue={defaultDatumDo}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold outline-none"
                required
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Ime
              </label>

              <input
                name="ime"
                defaultValue={searchParams.ime || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Prezime
              </label>

              <input
                name="prezime"
                defaultValue={searchParams.prezime || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Email
              </label>

              <input
                name="email"
                type="email"
                defaultValue={searchParams.email || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Telefon
              </label>

              <input
                name="telefon"
                defaultValue={searchParams.telefon || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              Adresa
            </label>

            <input
              name="adresa"
              defaultValue={searchParams.adresa || ""}
              className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
              required
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Grad
              </label>

              <input
                name="grad"
                defaultValue={searchParams.grad || ""}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Država
              </label>

              <select
                name="drzava"
                defaultValue={searchParams.drzava || "Hrvatska"}
                className="w-full cursor-pointer border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              >
                <option value="" disabled>
                  Odaberite državu
                </option>

                {DRZAVE.map((drzava) => (
                  <option key={drzava} value={drzava}>
                    {drzava}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-xs text-[#7b6f62]">
                Odaberite državu iz popisa.
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Broj osoba
              </label>

              <input
                name="brojOsoba"
                type="number"
                min={1}
                defaultValue={searchParams.brojOsoba || "2"}
                className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Ukupna cijena (€)
              </label>

              <input
                name="iznosUkupno"
                type="number"
                step="0.01"
                defaultValue={defaultIznosUkupno}
                readOnly
                className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-4 py-3 font-bold text-[#2e2923] outline-none"
                required
              />

              <p className="mt-1 text-xs text-[#7b6f62]">
                Cijena je izračunata prema odabranom terminu i admin cjeniku.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#2e2923]">
              Napomena
            </label>

            <textarea
              name="napomena"
              rows={4}
              defaultValue={searchParams.napomena || ""}
              className="w-full border border-[#d9cfbf] px-4 py-3 outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-6 py-3 font-bold text-white transition hover:brightness-95"
            >
              Nastavi na pregled
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}