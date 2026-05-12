import Link from "next/link";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function daysUntil(date?: Date | null) {
  if (!date) return null;

  const today = startOfDay(new Date());
  const target = startOfDay(date);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function ukupnoRezervacije(rezervacije: any[]) {
  const ukupno = rezervacije.reduce(
    (sum, r) => sum + Number(r.dogovoreniIznos || r.iznosUkupno || 0),
    0
  );

  const placeno = rezervacije.reduce(
    (sum, r) => sum + Number(r.iznosPlaceno || 0),
    0
  );

  return {
    broj: rezervacije.length,
    ukupno,
    placeno,
    ostatak: Math.max(ukupno - placeno, 0),
  };
}

function isPredlozenoZaStorno(r: any) {
  const placeno = Number(r.iznosPlaceno || 0);

  return (
    r.status !== "OTKAZANO" &&
    placeno <= 0 &&
    !!r.rokUplateAkontacije &&
    startOfDay(r.rokUplateAkontacije).getTime() <
      startOfDay(new Date()).getTime()
  );
}

function isDolaziUskoroNijePlaceno(r: any) {
  const ukupno = Number(r.dogovoreniIznos || r.iznosUkupno || 0);
  const placeno = Number(r.iznosPlaceno || 0);
  const ostatak = Math.max(ukupno - placeno, 0);
  const dana = daysUntil(r.datumOd);

  return (
    r.status !== "OTKAZANO" &&
    ostatak > 0 &&
    dana !== null &&
    dana >= 0 &&
    dana <= 7
  );
}

export default async function AdminPage() {
  const agencija = await prisma.ciscenjeAgencija.findFirst();
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  const rezervacijeAktivne = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
      placanja: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const cekaPotvrdu = rezervacijeAktivne.filter(
    (r) => r.status === "CEKA_POTVRDU"
  );

  const predlozenoZaStorno = rezervacijeAktivne.filter(isPredlozenoZaStorno);

  const dolaziUskoroNijePlaceno = rezervacijeAktivne.filter(
    isDolaziUskoroNijePlaceno
  );

  const cekaAkontaciju = rezervacijeAktivne.filter((r) => {
    const placeno = Number(r.iznosPlaceno || 0);

    return (
      placeno <= 0 &&
      (r.status === "CEKA_AKONTACIJU" || r.status === "REZERVIRANO")
    );
  });

  const ukupnoCekaAkontaciju = ukupnoRezervacije(cekaAkontaciju);

  const ciscenjeStatus = agencija?.email
    ? `Agencija: ${agencija.email}${agencija.ccEmails ? " · CC upisan" : ""}`
    : "Nije upisan email agencije";

  const automatikaStatus = postavke?.aktivno
    ? `Automatika uključena · ${postavke.brojDanaUnaprijed ?? 7} dana unaprijed`
    : "Automatika nije uključena";

  const kartice = [
    {
      title: "Monitor zauzeća",
      opis: "Operativni pregled dolazaka, odlazaka, gostiju u objektima i zauzeća.",
      href: "/admin/monitor",
      icon: "🖥️",
      badge: "Operativa",
    },
    {
      title: "Nova rezervacija",
      opis: "Ručno kreiranje rezervacije, popust, akontacija i link za plaćanje.",
      href: "/admin/rezervacije/nova",
      icon: "+",
      badge: "Admin",
    },
    {
      title: "Posebne prilike",
      opis: "Kratki slobodni termini, rupe između rezervacija, fiksna cijena i prikaz na webu.",
      href: "/admin/posebne-prilike",
      icon: "⭐",
      badge: "Web ponude",
    },
    {
      title: "Rezervacije",
      opis: "Pregled svih rezervacija, gostiju, plaćanja i računa.",
      href: "/admin/rezervacije",
      icon: "🧾",
      badge: "Lista",
    },
    {
      title: "Pregled naplate",
      opis: "Akontacije, rokovi, ostatak uplate, prijedlog storna i mjesečni zbrojevi.",
      href: "/admin/rezervacije/naplata",
      icon: "€",
      badge: predlozenoZaStorno.length > 0 ? "Upozorenje" : "Naplata",
    },
    {
      title: "Postavke naplate",
      opis: "Rokovi plaćanja, podsjetnici i pravila naplate.",
      href: "/admin/postavke/naplata",
      icon: "⚙️",
      badge: "Pravila",
    },
    {
      title: "Postavke računa",
      opis: "Podaci iznajmljivača, OIB, adresa, prefiks računa i PDF napomena.",
      href: "/admin/racuni/postavke",
      icon: "📄",
      badge: "Računi",
    },
    {
      title: "Cjenik",
      opis: "Cijene, minimalni boravak i posebne cijene.",
      href: "/admin/cjenik",
      icon: "€",
      badge: "Cijene",
    },
    {
      title: "Zatvori / otvori termine",
      opis: "Admin zatvaranje i ponovno otvaranje termina.",
      href: "/kalendar?admin=1",
      icon: "⛔",
      badge: "Admin",
    },
    {
      title: "Čišćenje i plan",
      opis: ciscenjeStatus,
      subopis: `${automatikaStatus} · Postavke agencije, slanje maila i plan čišćenja.`,
      href: "/admin/ciscenje",
      icon: "🧹",
      badge: agencija?.email ? "Spremno" : "Postavi",
    },
    {
      title: "Gosti",
      opis: "Pregled gostiju, država, oznaka i povijesti boravaka.",
      href: "/admin/gosti",
      icon: "👤",
      badge: "CRM",
    },
    {
      title: "Slike objekata",
      opis: "Upload slika po objektu, jedinici i posebnih slika za dashboard i početnu.",
      href: "/admin/slike",
      icon: "🖼️",
      badge: "Upload",
    },
    {
      title: "Oprema jedinica",
      opis: "Sadržaj svake jedinice: klima, WiFi, TV, terasa, parking i ostalo.",
      href: "/admin/jedinice/oprema",
      icon: "✓",
      badge: "Sadržaj",
    },
    {
      title: "Booking iCal sync",
      opis: "Dodavanje Booking iCal linkova po jedinici, ručni sync i kontrola zauzetosti.",
      href: "/admin/ical",
      icon: "🟣",
      badge: "Booking",
    },
  ];

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
        <section className="mb-6 border border-white/80 bg-white p-7 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-[#9b7a4c]">
                Malinska Stay Command Center
              </p>

              <h1 className="text-5xl font-black tracking-tight md:text-6xl">
                Upravljačka ploča
              </h1>

              <p className="mt-4 max-w-2xl text-base text-[#6f665a]">
                Rezervacije, naplata, financije, računi, čišćenje, cjenici,
                slike, oprema jedinica i Booking sync — sve na jednom mjestu.
              </p>
            </div>

            <div className="border border-[#d8c8aa] bg-[#f8f3ea] px-5 py-4 text-right">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#9b7a4c]">
                Sustav
              </div>

              <div className="mt-1 text-2xl font-black text-[#2e2923]">
                ONLINE
              </div>

              <div className="mt-1 text-sm text-[#6f665a]">
                Mail · PDF · Plaćanja
              </div>

              <LogoutButton />
            </div>
          </div>
        </section>

        {cekaPotvrdu.length > 0 && (
          <section className="mb-6 border-2 border-[#c79a57] bg-[#fff8e8] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.10)]">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-[#9b6b12]">
                  Hitno za odobrenje
                </div>

                <h2 className="mt-1 text-3xl font-black text-[#2e2923]">
                  Nepotvrđene rezervacije
                </h2>

                <p className="mt-1 text-sm text-[#6f665a]">
                  Ove rezervacije su tek zaprimljene i čekaju tvoju potvrdu.
                </p>
              </div>

              <Link
                href="/admin/rezervacije?status=CEKA_POTVRDU"
                className="border border-[#c79a57] bg-white px-4 py-2 text-sm font-black text-[#7a5a22] transition hover:bg-[#fff1c7]"
              >
                Otvori sve →
              </Link>
            </div>

            <div className="grid gap-3">
              {cekaPotvrdu.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/rezervacije/${r.id}`}
                  className="block border border-[#e2c98b] bg-white p-4 transition hover:bg-[#fffaf0]"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-lg font-black text-[#2e2923]">
                        {r.gost?.ime} {r.gost?.prezime}
                      </div>

                      <div className="mt-1 text-sm text-[#6f665a]">
                        {r.jedinica?.objekt?.naziv} · {r.jedinica?.naziv}
                      </div>

                      <div className="mt-1 text-sm font-bold text-[#7a5a22]">
                        {r.datumOd.toLocaleDateString("hr-HR")} –{" "}
                        {r.datumDo.toLocaleDateString("hr-HR")}
                      </div>
                    </div>

                    <div className="text-left md:text-right">
                      <div className="text-xl font-black text-[#2e2923]">
                        {money(r.dogovoreniIznos || r.iznosUkupno)}
                      </div>

                      <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#9b6b12]">
                        Čeka potvrdu
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(predlozenoZaStorno.length > 0 ||
          dolaziUskoroNijePlaceno.length > 0) && (
          <section className="mb-6 grid gap-3 lg:grid-cols-2">
            {predlozenoZaStorno.length > 0 && (
              <Link
                href="/admin/rezervacije/naplata?status=ISTEKAO_ROK_AKONTACIJE"
                className="block border border-[#d6aaa6] bg-[#fff4f2] p-4 text-[#7a2f2a] shadow-[0_10px_25px_rgba(0,0,0,0.06)] transition hover:bg-[#ffecea]"
              >
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#9b3f36]">
                  Predloženo za storno
                </div>

                <div className="mt-1 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">
                      {predlozenoZaStorno.length} rezervacija
                    </h2>
                    <p className="mt-1 text-sm">
                      Rok akontacije je istekao. Provjeriti telefonski prije
                      storna.
                    </p>
                  </div>

                  <div className="text-sm font-black">Otvori →</div>
                </div>
              </Link>
            )}

            {dolaziUskoroNijePlaceno.length > 0 && (
              <Link
                href="/admin/rezervacije/naplata?status=DOLAZI_USKORO_NIJE_PLACENO"
                className="block border border-[#d9c28c] bg-[#fff9e8] p-4 text-[#765819] shadow-[0_10px_25px_rgba(0,0,0,0.06)] transition hover:bg-[#fff4d5]"
              >
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#9b741f]">
                  Dolazak uskoro / nije plaćeno
                </div>

                <div className="mt-1 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">
                      {dolaziUskoroNijePlaceno.length} rezervacija
                    </h2>
                    <p className="mt-1 text-sm">
                      Gost dolazi kroz 7 dana ili manje, a postoji ostatak za
                      uplatu.
                    </p>
                  </div>

                  <div className="text-sm font-black">Otvori →</div>
                </div>
              </Link>
            )}
          </section>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <SmallStatus
            title="Čeka potvrdu"
            value={`${cekaPotvrdu.length} rezervacija`}
            description="Nove rezervacije koje treba ručno odobriti."
            href="/admin/rezervacije?status=CEKA_POTVRDU"
          />

          <SmallStatus
            title="Čišćenje"
            value={agencija?.email ? "Podešeno" : "Nedostaje email"}
            description="Email agencije, raspored i plan zadataka."
            href="/admin/ciscenje"
          />

          <SmallStatus
            title="Automatika"
            value={`${postavke?.brojDanaUnaprijed ?? 7} dana`}
            description={automatikaStatus}
            href="/admin/ciscenje"
          />
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {kartice.map((k) => (
            <Link
              key={k.href}
              href={k.href}
              className="group border border-white/80 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:border-[#caa870] hover:bg-[#fcfaf6]"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex h-14 w-14 items-center justify-center border border-[#e2d8c8] bg-[#f8f3ea] text-2xl font-black text-[#2e2923]">
                  {k.icon}
                </div>

                <span className="border border-[#e2d8c8] bg-[#f8f3ea] px-3 py-1 text-xs font-black uppercase text-[#7a5a22]">
                  {k.badge}
                </span>
              </div>

              <h2 className="text-2xl font-black text-[#2e2923]">{k.title}</h2>

              <p className="mt-3 text-sm leading-6 text-[#6f665a]">{k.opis}</p>

              {"subopis" in k && k.subopis && (
                <p className="mt-2 text-xs font-bold text-[#9b7a4c]">
                  {k.subopis}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-[#e2d8c8] pt-4">
                <span className="font-black text-[#9b6b12]">Otvori</span>
                <span className="text-2xl transition group-hover:translate-x-1">
                  →
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <div className="mt-8 flex flex-col items-end gap-1">
        <Link
          href="/admin/reset-rezervacije"
          className="text-xs font-bold text-[#c7b79c] transition hover:text-[#7a5a22]"
          title="Reset test rezervacija"
        >
          reset test rezervacija
        </Link>

        <Link
          href="/admin/rezervacije/obrisane"
          className="text-xs font-bold text-[#c7b79c] transition hover:text-[#7a5a22]"
          title="Obrisane rezervacije"
        >
          obrisane rezervacije
        </Link>
      </div>
    </main>
  );
}

function SmallStatus({
  title,
  value,
  description,
  href,
}: {
  title: string;
  value: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-white/80 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)] transition hover:-translate-y-1 hover:border-[#caa870] hover:bg-[#fcfaf6]"
    >
      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
        {title}
      </div>
      <div className="mt-2 text-2xl font-black text-[#2e2923]">{value}</div>
      <p className="mt-2 text-sm text-[#6f665a]">{description}</p>
    </Link>
  );
}
