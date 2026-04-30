import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

type SearchParams = Promise<{
  od?: string;
  do?: string;
}>;

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function monthLabel(value: Date) {
  return value.toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  });
}

function isSameDate(a: Date, b: Date) {
  return toIsoDate(a) === toIsoDate(b);
}

function isInRange(day: Date, from?: Date | null, to?: Date | null) {
  if (!from || !to) return false;
  return day >= from && day < to;
}

function countNights(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function cijenaZaDan(dan: Date, cjenici: any[]) {
  const cjenik = cjenici.find((c) => {
    return dan >= startOfDay(c.datumOd) && dan <= startOfDay(c.datumDo);
  });

  return Number(cjenik?.cijenaNocenja || 0);
}

async function izracunajCijenuTermina({
  jedinicaId,
  datumOd,
  datumDo,
}: {
  jedinicaId: string;
  datumOd: Date;
  datumDo: Date;
}) {
  let ukupno = 0;
  let dan = new Date(datumOd);

  while (dan < datumDo) {
    const cijena = await prisma.cjenik.findFirst({
      where: {
        jedinicaId,
        aktivno: true,
        datumOd: {
          lte: dan,
        },
        datumDo: {
          gte: dan,
        },
      },
      orderBy: {
        datumOd: "desc",
      },
    });

    ukupno += Number(cijena?.cijenaNocenja || 0);
    dan = addDays(dan, 1);
  }

  return Number(ukupno.toFixed(2));
}

export default async function PromjenaTerminaPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
  });

  if (!rezervacija) notFound();

  const odabraniOd = parseDateOnly(sp.od);
  const odabraniDo = parseDateOnly(sp.do);

  const trenutniUkupno = Number(
    rezervacija.dogovoreniIznos ||
      rezervacija.iznosUkupno ||
      rezervacija.iznosOsnovni ||
      0
  );

  const placeno = Number(rezervacija.iznosPlaceno || 0);
  const trenutniOstatak = Math.max(trenutniUkupno - placeno, 0);

  const noviBrojNocenja =
    odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? countNights(odabraniOd, odabraniDo)
      : 0;

  const novaOsnovnaCijena =
    odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? await izracunajCijenuTermina({
          jedinicaId: rezervacija.jedinicaId,
          datumOd: odabraniOd,
          datumDo: odabraniDo,
        })
      : 0;

  let novaCijena = novaOsnovnaCijena;

  if (Number(rezervacija.popustPostotak || 0) > 0) {
    novaCijena =
      novaOsnovnaCijena -
      (novaOsnovnaCijena * Number(rezervacija.popustPostotak || 0)) / 100;
  } else if (Number(rezervacija.popustIznos || 0) > 0) {
    novaCijena = Math.max(
      novaOsnovnaCijena - Number(rezervacija.popustIznos || 0),
      0
    );
  }

  novaCijena = Number(novaCijena.toFixed(2));

  const novaRazlika = Number((novaCijena - trenutniUkupno).toFixed(2));
  const noviOstatak = Math.max(novaCijena - placeno, 0);

  const kalendarStart = new Date(
    Math.min(
      startOfDay(new Date()).getTime(),
      startOfDay(rezervacija.datumOd).getTime()
    )
  );

  const prviMjesec = new Date(
    kalendarStart.getFullYear(),
    kalendarStart.getMonth(),
    1
  );

  const kalendarOd = prviMjesec;
  const kalendarDo = addMonths(kalendarOd, 6);

  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      jedinicaId: rezervacija.jedinicaId,
      status: {
        not: "OTKAZANO",
      },
      datumOd: {
        lt: kalendarDo,
      },
      datumDo: {
        gt: kalendarOd,
      },
    },
    include: {
      gost: true,
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const cjenici = await prisma.cjenik.findMany({
    where: {
      jedinicaId: rezervacija.jedinicaId,
      aktivno: true,
      datumOd: {
        lt: kalendarDo,
      },
      datumDo: {
        gte: kalendarOd,
      },
    },
    orderBy: [{ datumOd: "asc" }],
  });

  const postojiPreklapanje =
    odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? await prisma.rezervacija.findFirst({
          where: {
            id: {
              not: rezervacija.id,
            },
            jedinicaId: rezervacija.jedinicaId,
            status: {
              not: "OTKAZANO",
            },
            datumOd: {
              lt: odabraniDo,
            },
            datumDo: {
              gt: odabraniOd,
            },
          },
        })
      : null;

  const mjeseci = [0, 1, 2, 3, 4, 5].map((i) => {
    const d = addMonths(kalendarOd, i);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  async function potvrdiPromjenuTermina(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const noviDatumOdRaw = String(formData.get("datumOd") || "");
    const noviDatumDoRaw = String(formData.get("datumDo") || "");
    const razlog = String(formData.get("razlog") || "").trim();

    const potvrdaIzmjene =
      String(formData.get("potvrdaIzmjene") || "") === "on";

    const potvrdaTekst = String(formData.get("potvrdaTekst") || "")
      .trim()
      .toUpperCase();

    if (!potvrdaIzmjene || potvrdaTekst !== "POTVRĐUJEM") {
      throw new Error(
        "Izmjena nije potvrđena. Označite potvrdu i upišite POTVRĐUJEM."
      );
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const noviDatumOd = parseDateOnly(noviDatumOdRaw);
    const noviDatumDo = parseDateOnly(noviDatumDoRaw);

    if (!noviDatumOd || !noviDatumDo || noviDatumOd >= noviDatumDo) {
      throw new Error("Odaberite ispravan novi dolazak i odlazak.");
    }

    const preklapanje = await prisma.rezervacija.findFirst({
      where: {
        id: {
          not: rezervacijaId,
        },
        jedinicaId: r.jedinicaId,
        status: {
          not: "OTKAZANO",
        },
        datumOd: {
          lt: noviDatumDo,
        },
        datumDo: {
          gt: noviDatumOd,
        },
      },
    });

    if (preklapanje) {
      throw new Error("Novi termin se preklapa s drugom rezervacijom.");
    }

    const stariUkupno = Number(
      r.dogovoreniIznos || r.iznosUkupno || r.iznosOsnovni || 0
    );

    const novaOsnovna = await izracunajCijenuTermina({
      jedinicaId: r.jedinicaId,
      datumOd: noviDatumOd,
      datumDo: noviDatumDo,
    });

    let noviUkupno = novaOsnovna;

    if (Number(r.popustPostotak || 0) > 0) {
      noviUkupno =
        novaOsnovna - (novaOsnovna * Number(r.popustPostotak || 0)) / 100;
    } else if (Number(r.popustIznos || 0) > 0) {
      noviUkupno = Math.max(novaOsnovna - Number(r.popustIznos || 0), 0);
    }

    noviUkupno = Number(noviUkupno.toFixed(2));

    const placeno = Number(r.iznosPlaceno || 0);
    const ostatak = Math.max(noviUkupno - placeno, 0);
    const razlika = Number((noviUkupno - stariUkupno).toFixed(2));
    const nocenja = countNights(noviDatumOd, noviDatumDo);

    let noviStatus = r.status;

    if (r.status !== "OTKAZANO") {
      if (placeno >= noviUkupno && noviUkupno > 0) {
        noviStatus = "PLACENO";
      } else if (placeno > 0 && ostatak > 0) {
        noviStatus = "CEKA_OSTATAK";
      } else if (placeno === 0) {
        noviStatus = "CEKA_AKONTACIJU";
      }
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        datumOd: noviDatumOd,
        datumDo: noviDatumDo,
        brojNocenja: nocenja,
        iznosOsnovni: novaOsnovna,
        iznosUkupno: noviUkupno,
        dogovoreniIznos: noviUkupno,
        iznosOstatka: ostatak,
        status: noviStatus,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "PROMJENA_TERMINA",
        opis: `Promijenjen termin rezervacije. Nova cijena: ${noviUkupno.toFixed(
          2
        )} €. Razlika: ${razlika.toFixed(2)} €`,
        razlog: razlog || null,
        stariPodaci: JSON.stringify({
          datumOd: r.datumOd,
          datumDo: r.datumDo,
          brojNocenja: r.brojNocenja,
          ukupno: stariUkupno,
        }),
        noviPodaci: JSON.stringify({
          datumOd: noviDatumOd,
          datumDo: noviDatumDo,
          brojNocenja: nocenja,
          iznosOsnovni: novaOsnovna,
          ukupno: noviUkupno,
          placeno,
          ostatak,
          razlika,
        }),
        korisnikIme: "Admin",
      },
    });

    if (razlika > 0) {
      await prisma.placanje.create({
        data: {
          rezervacijaId,
          tip: "RAZLIKA",
          status: "CEKA_PLACANJE",
          iznos: razlika,
          valuta: "EUR",
          nacinPlacanja: "TEKUCI_RACUN",
          napomena:
            "Automatski kreiran zahtjev za doplatu razlike nakon promjene termina.",
        },
      });
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath(`/admin/rezervacije/${rezervacijaId}/promjena-termina`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

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
        <div className="mb-6 border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <Link
            href={`/admin/rezervacije/${rezervacija.id}`}
            className="cursor-pointer text-sm font-black text-cyan-200 hover:text-white"
          >
            ← Natrag na detalj rezervacije
          </Link>

          <h1 className="mt-4 text-4xl font-black">
            Promjena termina rezervacije
          </h1>

          <p className="mt-2 text-slate-300">
            {rezervacija.jedinica.objekt.naziv} / {rezervacija.jedinica.naziv}
          </p>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <Info
              label="Gost"
              value={`${rezervacija.gost?.ime || "Gost"} ${
                rezervacija.gost?.prezime || ""
              }`}
            />

            <Info
              label="Trenutni termin"
              value={`${formatDate(rezervacija.datumOd)} – ${formatDate(
                rezervacija.datumDo
              )}`}
            />

            <Info label="Trenutno ukupno" value={money(trenutniUkupno)} />
            <Info label="Plaćeno" value={money(placeno)} />
          </div>

          {(rezervacija.izvor === "BOOKING" || rezervacija.izvor === "WEB") && (
            <div className="mt-5 border border-amber-300/40 bg-amber-300/15 p-4 text-sm font-bold text-amber-100">
              OPREZ: ova rezervacija je došla putem {rezervacija.izvor}. Prije
              izmjene provjeri uplatu i vanjski sustav.
            </div>
          )}
        </div>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          <Legend color="#22c55e" label="Slobodno" />
          <Legend color="#ef4444" label="Zauzeto drugim rezervacijama" />
          <Legend color="#eab308" label="Stari termin gosta — može se odabrati" />
          <Legend color="#38bdf8" label="Novi odabrani termin" />
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="grid gap-4 xl:grid-cols-2">
            {mjeseci.map((mjesec) => (
              <MonthCalendar
                key={mjesec.toISOString()}
                mjesec={mjesec}
                rezervacijaId={rezervacija.id}
                rezervacije={rezervacije}
                cjenici={cjenici}
                odabraniOd={odabraniOd}
                odabraniDo={odabraniDo}
              />
            ))}
          </div>

          <aside className="border border-white/15 bg-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <h2 className="text-xl font-black">Novi odabir</h2>

            <div className="mt-4 space-y-3">
              <Info label="Novi dolazak" value={formatDate(odabraniOd)} />
              <Info label="Novi odlazak" value={formatDate(odabraniDo)} />
              <Info
                label="Noćenja"
                value={noviBrojNocenja ? `${noviBrojNocenja}` : "-"}
              />
              <Info
                label="Nova osnovna cijena"
                value={money(novaOsnovnaCijena)}
              />
              <Info
                label="Nova cijena s popustom"
                value={money(novaCijena)}
              />
              <Info label="Trenutno ukupno" value={money(trenutniUkupno)} />
              <Info label="Plaćeno" value={money(placeno)} />
              <Info label="Trenutni ostatak" value={money(trenutniOstatak)} />
              <Info label="Razlika" value={money(novaRazlika)} />
              <Info label="Novi ostatak za uplatu" value={money(noviOstatak)} />
            </div>

            {odabraniOd && odabraniDo && odabraniOd < odabraniDo && (
              <>
                {postojiPreklapanje ? (
                  <div className="mt-5 border border-red-300/40 bg-red-400/15 p-4 text-sm font-black text-red-100">
                    Novi termin se preklapa s drugom rezervacijom. Nije moguće
                    potvrditi.
                  </div>
                ) : (
                  <form
                    action={potvrdiPromjenuTermina}
                    className="mt-5 space-y-4"
                  >
                    <input
                      type="hidden"
                      name="rezervacijaId"
                      value={rezervacija.id}
                    />
                    <input
                      type="hidden"
                      name="datumOd"
                      value={toIsoDate(odabraniOd)}
                    />
                    <input
                      type="hidden"
                      name="datumDo"
                      value={toIsoDate(odabraniDo)}
                    />

                    <label className="block">
                      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                        Razlog promjene
                      </div>
                      <textarea
                        name="razlog"
                        rows={3}
                        className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                        placeholder="Npr. gost traži drugi termin..."
                      />
                    </label>

                    <div className="border border-red-300/40 bg-red-400/10 p-4">
                      <div className="text-sm font-black text-red-100">
                        Potvrda izmjene
                      </div>

                      <p className="mt-2 text-sm text-slate-200">
                        Ova radnja mijenja termin, cijenu, ostatak za uplatu i
                        status rezervacije. Promjena se zapisuje u povijest.
                      </p>

                      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-100">
                        <input
                          type="checkbox"
                          name="potvrdaIzmjene"
                          required
                          className="mt-1"
                        />
                        <span>
                          Sigurno želim promijeniti termin i potvrđujem da sam
                          provjerio zauzeće, cijenu, uplatu i posljedice
                          izmjene.
                        </span>
                      </label>

                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-red-100">
                          Za potvrdu upiši: POTVRĐUJEM
                        </label>

                        <input
                          name="potvrdaTekst"
                          required
                          placeholder="POTVRĐUJEM"
                          className="w-full border border-red-300/30 bg-black/30 px-3 py-2 font-black text-white outline-none"
                        />
                      </div>
                    </div>

                    <button className="w-full cursor-pointer border border-amber-300 bg-amber-300/20 px-5 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-300/30">
                      Potvrdi promjenu termina
                    </button>
                  </form>
                )}
              </>
            )}

            {(!odabraniOd || !odabraniDo) && (
              <p className="mt-5 text-sm text-slate-400">
                Klikni prvo novi datum dolaska, zatim datum odlaska. Žuti dani
                su stari termin tog gosta i smiju se odabrati.
              </p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function MonthCalendar({
  mjesec,
  rezervacijaId,
  rezervacije,
  cjenici,
  odabraniOd,
  odabraniDo,
}: {
  mjesec: Date;
  rezervacijaId: string;
  rezervacije: any[];
  cjenici: any[];
  odabraniOd: Date | null;
  odabraniDo: Date | null;
}) {
  const first = new Date(mjesec.getFullYear(), mjesec.getMonth(), 1, 12);
  const last = new Date(mjesec.getFullYear(), mjesec.getMonth() + 1, 0, 12);

  const startOffset = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }

  let d = first;
  while (d <= last) {
    cells.push(new Date(d));
    d = addDays(d, 1);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <section className="border border-white/15 bg-white/10 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <h2 className="mb-3 text-lg font-black capitalize text-white">
        {monthLabel(mjesec)}
      </h2>

      <div className="grid grid-cols-7 border-l border-t border-white/10 text-center text-xs font-black text-slate-300">
        {["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"].map((day) => (
          <div
            key={day}
            className="border-b border-r border-white/10 bg-black/25 p-1"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-white/10">
        {cells.map((dan, index) => {
          if (!dan) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-[60px] border-b border-r border-white/10 bg-black/10"
              />
            );
          }

          const iso = toIsoDate(dan);
          const cijena = cijenaZaDan(dan, cjenici);

          const trenutnaBoravi = rezervacije.find((r) => {
            return (
              r.id === rezervacijaId &&
              dan >= startOfDay(r.datumOd) &&
              dan < startOfDay(r.datumDo)
            );
          });

          const trenutnaOdlazak = rezervacije.find((r) => {
            return (
              r.id === rezervacijaId &&
              isSameDate(dan, startOfDay(r.datumDo))
            );
          });

          const drugaDolazak = rezervacije.find((r) => {
            return (
              r.id !== rezervacijaId &&
              isSameDate(dan, startOfDay(r.datumOd))
            );
          });

          const drugaBoravi = rezervacije.find((r) => {
            return (
              r.id !== rezervacijaId &&
              dan > startOfDay(r.datumOd) &&
              dan < startOfDay(r.datumDo)
            );
          });

          const drugaOdlazak = rezervacije.find((r) => {
            return (
              r.id !== rezervacijaId &&
              isSameDate(dan, startOfDay(r.datumDo))
            );
          });

          const selectedStart = odabraniOd && isSameDate(dan, odabraniOd);
          const selectedEnd = odabraniDo && isSameDate(dan, odabraniDo);
          const selectedRange = isInRange(dan, odabraniOd, odabraniDo);

          const mozeBitiOdlazak =
            odabraniOd && !odabraniDo && dan > odabraniOd;

          const q = new URLSearchParams();

          if (!odabraniOd || (odabraniOd && odabraniDo)) {
            q.set("od", iso);
          } else {
            if (dan > odabraniOd) {
              q.set("od", toIsoDate(odabraniOd));
              q.set("do", iso);
            } else {
              q.set("od", iso);
            }
          }

          let background = "rgba(34,197,94,0.20)";
          let borderColor = "rgba(34,197,94,0.45)";
          let title = "Slobodno";

          // Dan odlaska druge rezervacije:
          // može biti novi dolazak, zato pola crveno / pola zeleno.
          if (drugaOdlazak) {
            background =
              "linear-gradient(135deg, rgba(239,68,68,0.48) 0%, rgba(239,68,68,0.48) 49%, rgba(34,197,94,0.24) 51%, rgba(34,197,94,0.24) 100%)";
            borderColor = "rgba(255,255,255,0.18)";
            title = "Odlazak gosta / moguće novi dolazak";
          }

          // Dan dolaska druge rezervacije:
          // može biti odlazak, ali ne smije biti novi dolazak.
          if (drugaDolazak) {
            background =
              "linear-gradient(135deg, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.24) 49%, rgba(239,68,68,0.48) 51%, rgba(239,68,68,0.48) 100%)";
            borderColor = "rgba(255,255,255,0.18)";
            title = "Dolazak drugog gosta / moguće samo kao odlazak";
          }

          if (trenutnaOdlazak) {
            background =
              "linear-gradient(135deg, rgba(234,179,8,0.55) 0%, rgba(234,179,8,0.55) 49%, rgba(34,197,94,0.24) 51%, rgba(34,197,94,0.24) 100%)";
            borderColor = "rgba(234,179,8,0.75)";
            title = "Odlazak ovog gosta / slobodno za odabir";
          }

          if (trenutnaBoravi) {
            background = "rgba(234,179,8,0.42)";
            borderColor = "rgba(234,179,8,0.80)";
            title = "Stari termin ovog gosta";
          }

          if (selectedRange || selectedStart || selectedEnd) {
            background = "rgba(56,189,248,0.46)";
            borderColor = "rgba(56,189,248,0.90)";
            title = "Novi odabrani termin";
          }

          // Puni crveni dan: drugi gost boravi cijeli dan/noć.
          if (drugaBoravi) {
            return (
              <div
                key={iso}
                className="min-h-[60px] border-b border-r p-1 text-left"
                style={{
                  background: "rgba(239,68,68,0.42)",
                  borderColor: "rgba(239,68,68,0.70)",
                  cursor: "not-allowed",
                }}
                title="Zauzeto drugom rezervacijom"
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">
                      {dan.getDate()}
                    </span>
                    <span className="text-[10px] font-black text-red-100">
                      X
                    </span>
                  </div>

                  <div className="text-right text-[11px] font-black text-white">
                    {cijena > 0 ? `${cijena.toFixed(0)} €` : "—"}
                  </div>
                </div>
              </div>
            );
          }

          // Dan dolaska tuđe rezervacije smije biti kliknut samo kao ODLAZAK,
          // znači samo ako je admin već izabrao početni datum prije tog dana.
          if (drugaDolazak && !mozeBitiOdlazak) {
            return (
              <div
                key={iso}
                className="min-h-[60px] border-b border-r p-1 text-left"
                style={{
                  background,
                  borderColor,
                  cursor: "not-allowed",
                }}
                title={title}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">
                      {dan.getDate()}
                    </span>
                    <span className="text-[10px] font-black text-red-100">
                      X
                    </span>
                  </div>

                  <div className="text-right text-[11px] font-black text-white">
                    {cijena > 0 ? `${cijena.toFixed(0)} €` : "—"}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={iso}
              href={`?${q.toString()}`}
              className="min-h-[60px] cursor-pointer border-b border-r p-1 text-left transition hover:brightness-125"
              style={{
                background,
                borderColor,
              }}
              title={title}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-white">
                    {dan.getDate()}
                  </span>

                  {(selectedStart || selectedEnd) && (
                    <span className="text-[10px] font-black text-cyan-100">
                      {selectedStart ? "OD" : "DO"}
                    </span>
                  )}
                </div>

                <div className="text-right text-[11px] font-black text-white">
                  {cijena > 0 ? `${cijena.toFixed(0)} €` : "—"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-white">{value || "-"}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 border border-white/15 bg-white/10 p-3 text-sm font-black text-white">
      <span
        style={{
          width: 14,
          height: 14,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}