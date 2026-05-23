import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { jedinicaJeSlobodna } from "@/lib/zauzeca";

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

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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

  // Jedinstvena provjera dostupnosti kroz `jedinicaJeSlobodna` (lib/zauzeca.ts).
  // Stara verzija je gledala samo rezervacije (`not: "OTKAZANO"`) — ručne i
  // vanjske blokade (iCal/Booking) bi prošle, gost bi kliknuo "Rezerviraj" i
  // tek `create-payment` POST bi vratio 409. Sad je UI usklađen s validacijom.
  const slobodno = await jedinicaJeSlobodna({
    jedinicaId: akcija.jedinicaId,
    datumOd: akcija.datumOd,
    datumDo: akcija.datumDo,
  });
  const zauzeto = !slobodno;

  const ukupno = Number(akcija.cijenaUkupno || 0);
  const osobe = Number(
    akcija.brojOsoba || akcija.jedinica.ukupniKapacitet || 1
  );

  // `akcijaId` putuje kroz cijeli tok do `create-payment` POST-a, gdje server
  // dohvaća cijenu iz baze i ignorira `iznosUkupno` iz URL-a (zatvorena rupa
  // manipulacije cijene). `iznosUkupno` ostaje u URL-u samo za prikaz na
  // `/rezervacije/nova` i `/rezervacije/pregled` — server ga ne vjeruje.
  const rezervacijaParams = new URLSearchParams({
    jedinicaId: akcija.jedinicaId,
    datumOd: toIsoDate(akcija.datumOd),
    datumDo: toIsoDate(akcija.datumDo),
    iznosUkupno: String(ukupno),
    brojOsoba: String(osobe),
    napomena: `Posebna prilika: ${akcija.naziv || "Akcijska ponuda"}`,
    akcijaId: akcija.id,
  });

  return (
    <main
      className="min-h-screen bg-[#f4efe6] px-4 py-10"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <div className="mx-auto max-w-3xl bg-white p-8 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <Link href="/posebne-prilike" className="font-bold text-[#9b6b12]">
          ← Natrag na posebne prilike
        </Link>

        <p className="mt-8 text-sm font-bold uppercase tracking-[0.28em] text-[#c79a57]">
          Posebne prilike
        </p>

        <h1 className="mt-2 text-4xl font-black text-[#2e2923]">
          {akcija.naziv || "Posebna prilika"}
        </h1>

        {akcija.opis && (
          <>
            <style>{`
      @keyframes glowPulse {
        0% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(1.05); opacity: 1; }
        100% { transform: scale(1); opacity: 0.9; }
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `}</style>

            <div
              className="mt-6 text-center font-black"
              style={{
                fontSize: "26px",
                lineHeight: "1.4",
                background: "linear-gradient(90deg, #c79a57, #fff6e2, #c79a57)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 3s linear infinite, glowPulse 2s ease-in-out infinite",
                textShadow: "0 0 10px rgba(199,154,87,0.35)",
                letterSpacing: "0.5px",
              }}
            >
              {akcija.opis}
            </div>
          </>
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
          <Info
            label="Rezervacija"
            value="Standardna rezervacija s posebnom cijenom"
          />
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
          <Link
            href={`/rezervacije/nova?${rezervacijaParams.toString()}`}
            className="mt-8 block w-full cursor-pointer bg-[#c79a57] px-6 py-4 text-center font-black text-white transition hover:brightness-95"
          >
            Rezerviraj ovu posebnu priliku
          </Link>
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