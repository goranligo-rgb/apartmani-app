import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  id?: string;
}>;

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDate(d?: Date | null) {
  if (!d) return "-";

  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function brojNocenja(datumOd: Date, datumDo: Date) {
  return Math.ceil((datumDo.getTime() - datumOd.getTime()) / 86400000);
}

export default async function PosebnePrilikeRezervacijaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const id = sp.id || "";

  if (!id) {
    redirect("/posebne-prilike");
  }

  const akcija = await prisma.akcija.findUnique({
    where: { id },
    include: {
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
  });

  if (!akcija || !akcija.aktivna || !akcija.prikaziNaWebu) {
    redirect("/posebne-prilike");
  }

  const zauzeto = await prisma.rezervacija.findFirst({
    where: {
      jedinicaId: akcija.jedinicaId,
      status: {
        not: "OTKAZANO",
      },
      datumOd: {
        lt: akcija.datumDo,
      },
      datumDo: {
        gt: akcija.datumOd,
      },
    },
  });

  const ukupno = Number(akcija.cijenaUkupno || 0);
  const osobe = Number(
    akcija.brojOsoba || akcija.jedinica.ukupniKapacitet || 1
  );

  return (
    <main
      className="min-h-screen bg-[#f4efe6] px-4 py-10"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <div className="mx-auto max-w-3xl bg-white p-8 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <a href="/posebne-prilike" className="font-bold text-[#9b6b12]">
          ← Natrag na posebne prilike
        </a>

        <p className="mt-8 text-sm font-bold uppercase tracking-[0.28em] text-[#c79a57]">
          Posebne prilike
        </p>

        <h1 className="mt-2 text-4xl font-black text-[#2e2923]">
          {akcija.naziv || "Posebna prilika"}
        </h1>

        {akcija.opis && (
          <p className="mt-4 text-lg leading-relaxed text-[#6f665a]">
            {akcija.opis}
          </p>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Info label="Objekt" value={akcija.jedinica.objekt.naziv} />
          <Info label="Jedinica" value={akcija.jedinica.naziv} />
          <Info
            label="Termin"
            value={`${formatDate(akcija.datumOd)} – ${formatDate(
              akcija.datumDo
            )}`}
          />
          <Info label="Broj osoba" value={`${osobe}`} />
          <Info
            label="Noćenja"
            value={`${brojNocenja(akcija.datumOd, akcija.datumDo)}`}
          />
          <Info label="Plaćanje" value="100% odmah karticom" />
        </div>

        <div className="mt-8 border border-[#d8c8aa] bg-[#f8f3ea] p-6 text-center">
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#7a5a22]">
            Fiksna akcijska cijena
          </div>

          <div className="mt-2 text-5xl font-black text-[#2e2923]">
            {money(ukupno)}
          </div>
        </div>

        {zauzeto ? (
          <div className="mt-8 border border-red-300 bg-red-50 p-5 text-center font-black text-red-700">
            Ovaj termin je u međuvremenu zauzet.
          </div>
        ) : (
          <form
            action={async (formData) => {
              "use server";

              const preklapanje = await prisma.rezervacija.findFirst({
                where: {
                  jedinicaId: akcija.jedinicaId,
                  status: {
                    not: "OTKAZANO",
                  },
                  datumOd: {
                    lt: akcija.datumDo,
                  },
                  datumDo: {
                    gt: akcija.datumOd,
                  },
                },
              });

              if (preklapanje) {
                redirect(`/rezervacije/posebne-prilike?id=${akcija.id}`);
              }

              const ime = String(formData.get("ime") || "").trim();
              const prezime = String(formData.get("prezime") || "").trim();
              const email = String(formData.get("email") || "").trim();
              const telefon = String(formData.get("telefon") || "").trim();

              const gost = await prisma.gost.create({
                data: {
                  ime,
                  prezime: prezime || null,
                  email,
                  telefon: telefon || null,
                },
              });

              const nocenja = brojNocenja(akcija.datumOd, akcija.datumDo);

              const rezervacija = await prisma.rezervacija.create({
                data: {
                  jedinicaId: akcija.jedinicaId,
                  gostId: gost.id,
                  izvor: "WEB",
                  status: "CEKA_AKONTACIJU",

                  datumOd: akcija.datumOd,
                  datumDo: akcija.datumDo,
                  brojNocenja: nocenja,
                  brojOsoba: osobe,

                  iznosOsnovni: ukupno,
                  dogovoreniIznos: ukupno,
                  iznosUkupno: ukupno,
                  iznosPotvrde: ukupno,
                  iznosPlaceno: 0,
                  iznosOstatka: ukupno,

                  placenoKarticom: false,
                  valuta: "EUR",
                  razlogPopusta: "Posebna prilika",
                  napomena: `Rezervacija nastala iz posebne prilike: ${akcija.naziv}`,
                },
              });

              const placanje = await prisma.placanje.create({
                data: {
                  rezervacijaId: rezervacija.id,
                  tip: "CIJELI_IZNOS",
                  status: "CEKA_PLACANJE",
                  iznos: ukupno,
                  valuta: "EUR",
                  nacinPlacanja: "KARTICA",
                  provider: "TEST_KARTICA",
                  napomena: "Posebna prilika - plaćanje 100% iznosa odmah.",
                },
              });

              await prisma.rezervacijaPromjena.create({
                data: {
                  rezervacijaId: rezervacija.id,
                  tip: "KREIRANJE_WEB_REZERVACIJE",
                  opis: "Web rezervacija kreirana iz posebne prilike.",
                  noviPodaci: JSON.stringify({
                    akcijaId: akcija.id,
                    nazivAkcije: akcija.naziv,
                    jedinicaId: akcija.jedinicaId,
                    datumOd: akcija.datumOd,
                    datumDo: akcija.datumDo,
                    ukupno,
                    osobe,
                    placanjeId: placanje.id,
                  }),
                  korisnikIme: "Gost",
                },
              });

              redirect(`/placanje?placanjeId=${placanje.id}`);
            }}
            className="mt-8 space-y-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Ime">
                <input
                  name="ime"
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-3 outline-none"
                  required
                />
              </Field>

              <Field label="Prezime">
                <input
                  name="prezime"
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-3 outline-none"
                />
              </Field>
            </div>

            <Field label="Email">
              <input
                name="email"
                type="email"
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 outline-none"
                required
              />
            </Field>

            <Field label="Telefon">
              <input
                name="telefon"
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 outline-none"
              />
            </Field>

            <button className="w-full bg-[#c79a57] px-6 py-4 font-black text-white transition hover:brightness-95">
              Rezerviraj i plati 100%
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-[#fcfaf6] p-4">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a8175]">
        {label}
      </div>
      <div className="mt-1 font-black text-[#2e2923]">{value || "-"}</div>
    </div>
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
      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
        {label}
      </div>
      {children}
    </label>
  );
}