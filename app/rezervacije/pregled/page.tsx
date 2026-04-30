import Link from "next/link";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  jedinicaId?: string;
  datumOd?: string;
  datumDo?: string;
  ime?: string;
  prezime?: string;
  email?: string;
  telefon?: string;
  adresa?: string;
  grad?: string;
  drzava?: string;
  brojOsoba?: string;
  iznosUkupno?: string;
  napomena?: string;
}>;

function brojNocenja(datumOd: string, datumDo: string) {
  const od = new Date(datumOd);
  const doDatuma = new Date(datumDo);

  return Math.round(
    (doDatuma.getTime() - od.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export default async function PregledRezervacijePage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;

  const jedinicaId = searchParams.jedinicaId || "";
  const datumOd = searchParams.datumOd || "";
  const datumDo = searchParams.datumDo || "";

  const ime = searchParams.ime || "";
  const prezime = searchParams.prezime || "";
  const email = searchParams.email || "";
  const telefon = searchParams.telefon || "";

  const adresa = searchParams.adresa || "";
  const grad = searchParams.grad || "";
  const drzava = searchParams.drzava || "";

  const brojOsoba = Number(searchParams.brojOsoba || "1");
  const iznosUkupno = Number(searchParams.iznosUkupno || "0");
  const napomena = searchParams.napomena || "";

  const backParams = new URLSearchParams({
    jedinicaId,
    datumOd,
    datumDo,
    ime,
    prezime,
    email,
    telefon,
    adresa,
    grad,
    drzava,
    brojOsoba: String(brojOsoba),
    iznosUkupno: String(iznosUkupno),
    napomena,
  });

  if (
    !jedinicaId ||
    !datumOd ||
    !datumDo ||
    !ime ||
    !prezime ||
    !email ||
    !telefon ||
    !adresa ||
    !grad ||
    !drzava
  ) {
    return (
      <main className="min-h-screen p-8">
        <h1>Nedostaju podaci za pregled rezervacije.</h1>
      </main>
    );
  }

  const jedinica = await prisma.jedinica.findUnique({
    where: { id: jedinicaId },
    include: { objekt: true },
  });

  if (!jedinica) {
    return (
      <main className="min-h-screen p-8">
        <h1>Jedinica nije pronađena.</h1>
      </main>
    );
  }

  const nocenja = brojNocenja(datumOd, datumDo);
  const postotak = jedinica.postotakAkontacije ?? 30;
  const iznosPotvrde = Number(((iznosUkupno * postotak) / 100).toFixed(2));

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
        <h1 className="text-3xl font-bold text-[#2e2923]">
          Pregled rezervacije
        </h1>

        <p className="mt-2 text-[#6f665a]">
          Za potvrdu rezervacije naplaćuje se {postotak}% ukupnog iznosa.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Box label="Objekt" value={jedinica.objekt.naziv} />
          <Box label="Jedinica" value={jedinica.naziv} />
          <Box label="Dolazak" value={datumOd} />
          <Box label="Odlazak" value={datumDo} />
          <Box label="Noćenja" value={String(nocenja)} />
          <Box label="Broj osoba" value={String(brojOsoba)} />
          <Box label="Ukupna cijena" value={`€ ${iznosUkupno.toFixed(2)}`} />
          <Box
            label="Potvrda rezervacije"
            value={`€ ${iznosPotvrde.toFixed(2)} (${postotak}%)`}
          />
        </div>

        <div className="mt-8 border border-[#e7dece] bg-[#fcfaf6] p-5">
          <div className="mb-3 text-sm font-bold text-[#8c7f71]">
            Podaci gosta
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Box label="Ime" value={ime} />
            <Box label="Prezime" value={prezime} />
            <Box label="Email" value={email} />
            <Box label="Telefon" value={telefon} />
            <Box label="Adresa" value={adresa} />
            <Box label="Grad" value={grad} />
            <Box label="Država" value={drzava} />
          </div>
        </div>

        {napomena ? (
          <div className="mt-6 border border-[#e7dece] bg-[#fcfaf6] p-5">
            <div className="mb-2 text-sm font-bold text-[#8c7f71]">
              Napomena
            </div>
            <div className="text-[#2e2923]">{napomena}</div>
          </div>
        ) : null}

        <div className="mt-6 border border-[#f1ddbb] bg-[#fff6e2] p-4 text-[#7e5d15]">
          Prilikom potvrde rezervacije kartica se autorizira za {postotak}% ukupnog
          iznosa. Novac se ne skida odmah, nego se sredstva samo rezerviraju do konačne
          potvrde rezervacije.
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/rezervacije/nova?${backParams.toString()}`}
            className="cursor-pointer border border-[#d9cfbf] bg-white px-5 py-3 font-semibold text-[#2e2923] transition hover:bg-[#f8f3ea]"
          >
            Natrag na ispravak podataka
          </Link>

          <form action="/api/rezervacije/create-payment" method="POST">
            <input type="hidden" name="jedinicaId" value={jedinicaId} />
            <input type="hidden" name="datumOd" value={datumOd} />
            <input type="hidden" name="datumDo" value={datumDo} />

            <input type="hidden" name="ime" value={ime} />
            <input type="hidden" name="prezime" value={prezime} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="telefon" value={telefon} />
            <input type="hidden" name="adresa" value={adresa} />
            <input type="hidden" name="grad" value={grad} />
            <input type="hidden" name="drzava" value={drzava} />

            <input type="hidden" name="brojOsoba" value={brojOsoba} />
            <input type="hidden" name="iznosUkupno" value={iznosUkupno} />
            <input type="hidden" name="iznosPotvrde" value={iznosPotvrde} />
            <input type="hidden" name="napomena" value={napomena} />

            <button
              type="submit"
              className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 font-bold text-white transition hover:brightness-95"
            >
              Plati potvrdu rezervacije
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-[#fcfaf6] p-4">
      <div className="text-sm text-[#8c7f71]">{label}</div>
      <div className="mt-1 font-bold text-[#2e2923]">{value}</div>
    </div>
  );
}