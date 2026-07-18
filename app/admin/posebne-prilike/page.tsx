import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  objektId?: string;
  jedinicaId?: string;
  od?: string;
  do?: string;
  mjesecOffset?: string;
}>;

function parseDateOnly(value?: string | null) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseRequiredDate(value: string) {
  const d = parseDateOnly(value);

  if (!d) {
    throw new Error("Neispravan datum.");
  }

  return d;
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

function toInputDate(value?: Date | null) {
  if (!value) return "";

  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function isSameDate(a: Date, b: Date) {
  return toInputDate(a) === toInputDate(b);
}

function isInRange(day: Date, from?: Date | null, to?: Date | null) {
  if (!from || !to) return false;
  return day >= from && day < to;
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

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function brojNocenja(datumOd: Date, datumDo: Date) {
  return Math.ceil((datumDo.getTime() - datumOd.getTime()) / 86400000);
}

function boolFromForm(value: FormDataEntryValue | null) {
  return String(value || "") === "on";
}

function cijenaZaDan(dan: Date, cjenici: any[]) {
  const cjenik = cjenici.find((c) => {
    return dan >= startOfDay(c.datumOd) && dan <= startOfDay(c.datumDo);
  });

  return Number(cjenik?.cijenaNocenja || 0);
}

function kapacitetLabel(jedinica: any) {
  const osnovni = Number(jedinica?.osnovniKapacitet || 0);
  const dodatni = Number(jedinica?.dodatniKapacitet || 0);
  const ukupno = Number(jedinica?.ukupniKapacitet || osnovni + dodatni || 0);

  if (osnovni > 0 && dodatni > 0) {
    return `${osnovni} + ${dodatni} osoba`;
  }

  if (ukupno > 0) {
    return `${ukupno} osoba`;
  }

  return "broj osoba nije upisan";
}

function webRezervacijaLink(a: any) {
  const q = new URLSearchParams();

  q.set("jedinicaId", a.jedinicaId);
  q.set("datumOd", toInputDate(a.datumOd));
  q.set("datumDo", toInputDate(a.datumDo));
  q.set("iznosUkupno", String(Number(a.cijenaUkupno || 0)));
  q.set(
    "brojOsoba",
    String(Number(a.brojOsoba || a.jedinica?.ukupniKapacitet || 1))
  );
  q.set("posebnaPrilikaId", a.id);

  return `/kalendar?${q.toString()}`;
}

function buildAdminHref({
  objektId,
  jedinicaId,
  od,
  doDatuma,
  mjesecOffset,
}: {
  objektId?: string;
  jedinicaId?: string;
  od?: string;
  doDatuma?: string;
  mjesecOffset?: number;
}) {
  const q = new URLSearchParams();

  if (objektId) q.set("objektId", objektId);
  if (jedinicaId) q.set("jedinicaId", jedinicaId);
  if (od) q.set("od", od);
  if (doDatuma) q.set("do", doDatuma);
  if (mjesecOffset) q.set("mjesecOffset", String(mjesecOffset));

  const s = q.toString();
  return s ? `/admin/posebne-prilike?${s}` : "/admin/posebne-prilike";
}

function diagonalBg(left: string, right: string) {
  return `linear-gradient(135deg, ${left} 0%, ${left} 49%, ${right} 51%, ${right} 100%)`;
}

function statusBoja(status: string) {
  if (status === "CEKA_AKONTACIJU" || status === "REZERVIRANO") {
    return {
      bg: "rgba(245,158,11,0.36)",
      border: "rgba(245,158,11,0.65)",
      marker: "!",
    };
  }

  if (
    status === "POTVRDENO" ||
    status === "PLACENO" ||
    status === "CEKA_OSTATAK"
  ) {
    return {
      bg: "rgba(217,83,79,0.44)",
      border: "rgba(217,83,79,0.70)",
      marker: "X",
    };
  }

  return {
    bg: "rgba(234,179,8,0.30)",
    border: "rgba(234,179,8,0.65)",
    marker: "?",
  };
}

export default async function AdminPosebnePrilikePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const mjesecOffset = Number.parseInt(params.mjesecOffset ?? "0", 10) || 0;

  const odabraniOd = parseDateOnly(params.od);
  const odabraniDo = parseDateOnly(params.do);

  const objekti = await prisma.objekt.findMany({
    where: {
      aktivan: true,
    },
    include: {
      jedinice: {
        where: {
          aktivna: true,
        },
        orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { naziv: "asc" }],
  });

  const odabraniObjekt = params.objektId
    ? objekti.find((o) => o.id === params.objektId)
    : null;

  const jediniceZaOdabir = odabraniObjekt
    ? odabraniObjekt.jedinice
    : objekti.flatMap((o) => o.jedinice);

  const odabranaJedinica = params.jedinicaId
    ? await prisma.jedinica.findUnique({
      where: { id: params.jedinicaId },
      include: {
        objekt: true,
      },
    })
    : null;

  const danas = startOfDay(new Date());
  const baznoOd = new Date(danas.getFullYear(), danas.getMonth(), 1);
  const kalendarOd = addMonths(baznoOd, mjesecOffset);
  const kalendarDo = addMonths(kalendarOd, 3);

  const rezervacije = odabranaJedinica
    ? await prisma.rezervacija.findMany({
      where: {
        jedinicaId: odabranaJedinica.id,
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
    })
    : [];

  const cjenici = odabranaJedinica
    ? await prisma.cjenik.findMany({
      where: {
        jedinicaId: odabranaJedinica.id,
        aktivno: true,
        datumOd: {
          lt: kalendarDo,
        },
        datumDo: {
          gte: kalendarOd,
        },
      },
      orderBy: [{ datumOd: "asc" }],
    })
    : [];

  const postojecePosebneZaKalendar = odabranaJedinica
    ? await prisma.akcija.findMany({
      where: {
        jedinicaId: odabranaJedinica.id,
        aktivna: true,
        datumOd: {
          lt: kalendarDo,
        },
        datumDo: {
          gt: kalendarOd,
        },
      },
      orderBy: [{ datumOd: "asc" }],
    })
    : [];

  const mjeseci = [0, 1].map((i) => {
    const d = addMonths(kalendarOd, i);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const posebnePrilike = await prisma.akcija.findMany({
    where: {
      ...(params.objektId
        ? {
          jedinica: {
            objektId: params.objektId,
          },
        }
        : {}),
      ...(params.jedinicaId
        ? {
          jedinicaId: params.jedinicaId,
        }
        : {}),
    },
    include: {
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [{ datumOd: "asc" }, { createdAt: "desc" }],
  });

  const aktivnePosebne = posebnePrilike.filter(
    (a) => a.aktivna && startOfDay(a.datumDo).getTime() >= danas.getTime()
  );

  const proslePosebne = posebnePrilike.filter(
    (a) => !a.aktivna || startOfDay(a.datumDo).getTime() < danas.getTime()
  );

  async function kreirajPosebnuPriliku(formData: FormData) {
    "use server";

    const jedinicaId = String(formData.get("jedinicaId") || "");
    const naziv = String(formData.get("naziv") || "Posebna prilika").trim();
    const opis = String(formData.get("opis") || "").trim();

    const datumOdRaw = String(formData.get("datumOd") || "");
    const datumDoRaw = String(formData.get("datumDo") || "");

    const cijenaUkupno = Number(
      String(formData.get("cijenaUkupno") || "0").replace(",", ".")
    );

    const prikaziNaWebu = boolFromForm(formData.get("prikaziNaWebu"));
    const aktivna = boolFromForm(formData.get("aktivna"));

    if (!jedinicaId || !datumOdRaw || !datumDoRaw) {
      throw new Error("Odaberi jedinicu i termin.");
    }

    const datumOd = parseRequiredDate(datumOdRaw);
    const datumDo = parseRequiredDate(datumDoRaw);

    if (datumOd >= datumDo) {
      throw new Error("Datum odlaska mora biti nakon dolaska.");
    }

    if (!Number.isFinite(cijenaUkupno) || cijenaUkupno <= 0) {
      throw new Error("Posebna cijena mora biti veća od 0.");
    }

    const jedinica = await prisma.jedinica.findUnique({
      where: { id: jedinicaId },
    });

    if (!jedinica) {
      throw new Error("Jedinica nije pronađena.");
    }

    // >>> PRIVREMENI DEBUG (ukloniti nakon dijagnostike posebnih prilika) <<<
    console.log("[POSEBNA-PRILIKA DEBUG] ulazne vrijednosti provjere:", {
      jedinicaId,
      jedinicaNaziv: jedinica.naziv,
      datumOd_iso: datumOd.toISOString(),
      datumDo_iso: datumDo.toISOString(),
      datumOd_raw: String(datumOd),
      datumDo_raw: String(datumDo),
      serverTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const postojiRezervacija = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId,
        status: {
          not: "OTKAZANO",
        },
        datumOd: {
          lt: datumDo,
        },
        datumDo: {
          gt: datumOd,
        },
      },
    });

    // >>> PRIVREMENI DEBUG (ukloniti nakon dijagnostike posebnih prilika) <<<
    console.log(
      "[POSEBNA-PRILIKA DEBUG] findFirst rezervacija rezultat:",
      postojiRezervacija
        ? {
            id: postojiRezervacija.id,
            jedinicaId: postojiRezervacija.jedinicaId,
            status: postojiRezervacija.status,
            izvor: postojiRezervacija.izvor,
            datumOd_iso: postojiRezervacija.datumOd.toISOString(),
            datumDo_iso: postojiRezervacija.datumDo.toISOString(),
            obrisanoAt: postojiRezervacija.obrisanoAt
              ? postojiRezervacija.obrisanoAt.toISOString()
              : null,
            bookingIcalUid: postojiRezervacija.bookingIcalUid,
          }
        : "NEMA (null) — provjera rezervacija prolazi"
    );

    if (postojiRezervacija) {
      throw new Error(
        "Ne može se kreirati posebna prilika jer je termin već zauzet rezervacijom."
      );
    }

    // >>> PRIVREMENI DEBUG (ukloniti nakon dijagnostike posebnih prilika) <<<
    console.log("[POSEBNA-PRILIKA DEBUG] ulazne vrijednosti provjere BLOKADE:", {
      jedinicaId,
      jedinicaNaziv: jedinica.naziv,
      datumOd_iso: datumOd.toISOString(),
      datumDo_iso: datumDo.toISOString(),
      datumOd_raw: String(datumOd),
      datumDo_raw: String(datumDo),
      serverTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const postojiBlokada = await prisma.blokadaJedinice.findFirst({
      where: {
        jedinicaId,
        aktivna: true,
        datumOd: {
          lt: datumDo,
        },
        datumDo: {
          gt: datumOd,
        },
      },
    });

    // >>> PRIVREMENI DEBUG (ukloniti nakon dijagnostike posebnih prilika) <<<
    console.log(
      "[POSEBNA-PRILIKA DEBUG] findFirst blokada rezultat:",
      postojiBlokada
        ? {
            id: postojiBlokada.id,
            jedinicaId: postojiBlokada.jedinicaId,
            aktivna: postojiBlokada.aktivna,
            izvor: postojiBlokada.izvor,
            datumOd_iso: postojiBlokada.datumOd.toISOString(),
            datumDo_iso: postojiBlokada.datumDo.toISOString(),
            razlog: postojiBlokada.razlog,
            externalId: postojiBlokada.externalId,
          }
        : "NEMA (null) — provjera blokada prolazi"
    );

    if (postojiBlokada) {
      throw new Error(
        "Ne može se kreirati posebna prilika jer je termin blokiran."
      );
    }

    await prisma.akcija.create({
      data: {
        jedinicaId,
        naziv: naziv || "Posebna prilika",
        opis: opis || null,
        datumOd,
        datumDo,
        brojOsoba: jedinica.ukupniKapacitet,
        postotakPopusta: null,
        cijenaUkupno,
        prikaziNaWebu,
        aktivna,
      },
    });

    revalidatePath("/admin/posebne-prilike");
    revalidatePath("/");
    revalidatePath("/posebne-prilike");

    redirect(
      buildAdminHref({
        jedinicaId,
        od: toInputDate(datumOd),
        doDatuma: toInputDate(datumDo),
      })
    );
  }

  async function promijeniAktivnost(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const aktivna = String(formData.get("aktivna") || "") === "true";

    await prisma.akcija.update({
      where: { id },
      data: {
        aktivna,
      },
    });

    revalidatePath("/admin/posebne-prilike");
    revalidatePath("/");
    revalidatePath("/posebne-prilike");

    redirect("/admin/posebne-prilike");
  }

  async function promijeniWebPrikaz(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const prikaziNaWebu = String(formData.get("prikaziNaWebu") || "") === "true";

    await prisma.akcija.update({
      where: { id },
      data: {
        prikaziNaWebu,
      },
    });

    revalidatePath("/admin/posebne-prilike");
    revalidatePath("/");
    revalidatePath("/posebne-prilike");

    redirect("/admin/posebne-prilike");
  }

  async function obrisiPosebnuPriliku(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");

    await prisma.akcija.delete({
      where: { id },
    });

    revalidatePath("/admin/posebne-prilike");
    revalidatePath("/");
    revalidatePath("/posebne-prilike");

    redirect("/admin/posebne-prilike");
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f4f1ec 0%, #eee8df 48%, #e7dfd3 100%)",
      }}
    >
      <div className="mx-auto max-w-[1600px] text-[#2e2923]">
        <section className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black">Posebne prilike</h1>

              <p className="mt-2 text-[#6f665a]">
                Kalendar pokazuje rupe u rezervacijama. Odaberi jedinicu,
                klikni datum od i do, zatim spremi posebnu priliku.
              </p>
            </div>

            <Link
              href="/posebne-prilike"
              target="_blank"
              className="inline-block border border-[#caa870] bg-[#fff6e2] px-5 py-3 text-sm font-black text-[#7a5a22] hover:bg-[#f8f3ea]"
            >
              Pogledaj web prikaz
            </Link>
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[280px_1fr_360px]">
          <aside className="space-y-4">
            <div className="border border-white/80 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
              <h2 className="text-xl font-black">Odabir jedinice</h2>

              <div className="mt-4">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#9b7a4c]">
                  Objekti
                </div>

                <div className="space-y-2">
                  <Link
                    href="/admin/posebne-prilike"
                    className={`block border px-3 py-2 text-sm font-black ${!params.objektId
                      ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                      : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                      }`}
                  >
                    Svi objekti
                  </Link>

                  {objekti.map((o) => (
                    <Link
                      key={o.id}
                      href={buildAdminHref({ objektId: o.id })}
                      className={`block border px-3 py-2 text-sm font-black ${params.objektId === o.id
                        ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                        : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                        }`}
                    >
                      {o.naziv}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#9b7a4c]">
                  Jedinice
                </div>

                <div className="space-y-2">
                  {jediniceZaOdabir.map((j) => {
                    const objekt = objekti.find((o) =>
                      o.jedinice.some((x) => x.id === j.id)
                    );

                    return (
                      <Link
                        key={j.id}
                        href={buildAdminHref({
                          objektId: params.objektId || objekt?.id,
                          jedinicaId: j.id,
                        })}
                        className={`block border px-3 py-2 text-sm font-black ${params.jedinicaId === j.id
                          ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                          : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                          }`}
                      >
                        {objekt?.naziv ? `${objekt.naziv} / ` : ""}
                        {j.naziv}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            {!odabranaJedinica ? (
              <div className="border border-white/80 bg-white p-6 text-[#6f665a] shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                Odaberi jedinicu s lijeve strane da se otvori kalendar zauzeća.
              </div>
            ) : (
              <>
                <div className="border border-white/80 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                  <h2 className="text-2xl font-black">
                    {odabranaJedinica.objekt.naziv} / {odabranaJedinica.naziv}
                  </h2>

                  <p className="mt-1 text-sm text-[#6f665a]">
                    Kalendar prikazuje zauzeće. Zelene rupe su slobodne za
                    Posebnu priliku. Klikni prvi dan i zatim zadnji dan.
                  </p>

                  <div className="mt-3 inline-block border border-[#d8c8aa] bg-[#f8f3ea] px-3 py-2 text-sm font-black text-[#7a5a22]">
                    Kapacitet iz sustava: {kapacitetLabel(odabranaJedinica)}
                  </div>

                  {odabraniOd && odabraniDo && odabraniOd < odabraniDo && (
                    <div className="mt-4 border border-[#d8c8aa] bg-[#fff6e2] p-3 text-sm">
                      Odabrano:{" "}
                      <b>
                        {formatDate(odabraniOd)} – {formatDate(odabraniDo)}
                      </b>{" "}
                      · {brojNocenja(odabraniOd, odabraniDo)} noći ·{" "}
                      {kapacitetLabel(odabranaJedinica)}
                    </div>
                  )}
                </div>

                <div className="border border-white/80 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                  <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-black">
                        Nova posebna prilika
                      </h2>

                      <p className="mt-1 text-sm text-[#6f665a]">
                        Broj osoba se automatski uzima iz kapaciteta jedinice.
                      </p>
                    </div>

                    <div className="border border-[#d8c8aa] bg-[#f8f3ea] px-3 py-2 text-sm font-black text-[#7a5a22]">
                      {kapacitetLabel(odabranaJedinica)}
                    </div>
                  </div>

                  <form
                    key={`${toInputDate(odabraniOd)}-${toInputDate(odabraniDo)}-${odabranaJedinica.id}`}
                    action={kreirajPosebnuPriliku}
                    className="grid gap-3 xl:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr]"
                  >
                    <input
                      type="hidden"
                      name="jedinicaId"
                      value={odabranaJedinica.id}
                    />

                    <Field label="Naziv">
                      <input
                        name="naziv"
                        defaultValue="Posebna prilika"
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <Field label="Datum od">
                      <input
                        name="datumOd"
                        type="date"
                        value={toInputDate(odabraniOd)}
                        readOnly
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <Field label="Datum do">
                      <input
                        name="datumDo"
                        type="date"
                        value={toInputDate(odabraniDo)}
                        readOnly
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <Field label="Fiksna cijena">
                      <input
                        name="cijenaUkupno"
                        type="number"
                        min={0.01}
                        step="0.01"
                        placeholder="npr. 240"
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <div className="xl:col-span-2">
                      <Field label="Opis">
                        <input
                          name="opis"
                          placeholder="npr. Kratki slobodni termin, posebna prilika za 2 noći."
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                        />
                      </Field>
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 border border-[#e2d8c8] bg-[#f8f3ea] px-3 py-3">
                      <input
                        name="prikaziNaWebu"
                        type="checkbox"
                        defaultChecked
                      />
                      <span className="font-black">Prikaži na webu</span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-3 border border-[#e2d8c8] bg-[#f8f3ea] px-3 py-3">
                      <input name="aktivna" type="checkbox" defaultChecked />
                      <span className="font-black">Aktivna</span>
                    </label>

                    <button className="xl:col-span-4 cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95">
                      Spremi posebnu priliku
                    </button>
                  </form>
                </div>

                <section className="grid gap-3 md:grid-cols-4">
                  <Legend color="#86efac" label="Slobodno" />
                  <Legend color="#d9534f" label="Zauzeto" />
                  <Legend color="#3b82f6" label="Odabrano" />
                  <Legend color="#8b5cf6" label="Posebna prilika" />
                </section>

                <div className="flex items-center justify-center gap-2">
                  <Link
                    href={`${buildAdminHref({ objektId: params.objektId, jedinicaId: params.jedinicaId, od: params.od, doDatuma: params.do, mjesecOffset: mjesecOffset - 1 })}#kalendar`}
                    className="border border-[#e2d8c8] bg-white px-4 py-2 text-sm font-black text-[#6f665a] hover:bg-[#f8f3ea]"
                  >
                    ← Prethodni
                  </Link>

                  <Link
                    href={`${buildAdminHref({ objektId: params.objektId, jedinicaId: params.jedinicaId, od: params.od, doDatuma: params.do })}#kalendar`}
                    className="border border-[#e2d8c8] bg-white px-4 py-2 text-sm font-black text-[#6f665a] hover:bg-[#f8f3ea]"
                  >
                    Danas
                  </Link>

                  <Link
                    href={`${buildAdminHref({ objektId: params.objektId, jedinicaId: params.jedinicaId, od: params.od, doDatuma: params.do, mjesecOffset: mjesecOffset + 1 })}#kalendar`}
                    className="border border-[#e2d8c8] bg-white px-4 py-2 text-sm font-black text-[#6f665a] hover:bg-[#f8f3ea]"
                  >
                    Sljedeći →
                  </Link>
                </div>

                <div id="kalendar" className="grid scroll-mt-40 gap-4 xl:grid-cols-2">
                  {mjeseci.map((mjesec) => (
                    <MonthCalendar
                      key={mjesec.toISOString()}
                      mjesec={mjesec}
                      objektId={params.objektId}
                      jedinicaId={odabranaJedinica.id}
                      rezervacije={rezervacije}
                      cjenici={cjenici}
                      posebnePrilike={postojecePosebneZaKalendar}
                      odabraniOd={odabraniOd}
                      odabraniDo={odabraniDo}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="space-y-4">
            <SidePanel
              title="Aktivne posebne prilike"
              count={aktivnePosebne.length}
              tone="active"
              items={aktivnePosebne}
              promijeniAktivnost={promijeniAktivnost}
              promijeniWebPrikaz={promijeniWebPrikaz}
              obrisiPosebnuPriliku={obrisiPosebnuPriliku}
            />

            <SidePanel
              title="Prošle / ugašene"
              count={proslePosebne.length}
              tone="past"
              items={proslePosebne}
              promijeniAktivnost={promijeniAktivnost}
              promijeniWebPrikaz={promijeniWebPrikaz}
              obrisiPosebnuPriliku={obrisiPosebnuPriliku}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function MonthCalendar({
  mjesec,
  objektId,
  jedinicaId,
  rezervacije,
  cjenici,
  posebnePrilike,
  odabraniOd,
  odabraniDo,
}: {
  mjesec: Date;
  objektId?: string;
  jedinicaId: string;
  rezervacije: any[];
  cjenici: any[];
  posebnePrilike: any[];
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
    <section className="border border-white/80 bg-white p-3 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <h2 className="mb-3 text-lg font-black capitalize text-[#2e2923]">
        {monthLabel(mjesec)}
      </h2>

      <div className="grid grid-cols-7 border-l border-t border-[#e2d8c8] text-center text-xs font-black text-[#6f665a]">
        {["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"].map((day) => (
          <div
            key={day}
            className="border-b border-r border-[#e2d8c8] bg-[#f8f3ea] p-1"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-[#e2d8c8]">
        {cells.map((dan, index) => {
          if (!dan) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-[60px] border-b border-r border-[#e2d8c8] bg-[#f7f1e8]"
              />
            );
          }

          const iso = toInputDate(dan);
          const cijena = cijenaZaDan(dan, cjenici);

          const dolazak = rezervacije.find((r) =>
            isSameDate(dan, startOfDay(r.datumOd))
          );

          const odlazak = rezervacije.find((r) =>
            isSameDate(dan, startOfDay(r.datumDo))
          );

          const boravi = rezervacije.find(
            (r) => dan > startOfDay(r.datumOd) && dan < startOfDay(r.datumDo)
          );

          const posebna = posebnePrilike.find(
            (a) => dan >= startOfDay(a.datumOd) && dan < startOfDay(a.datumDo)
          );

          const selectedStart = odabraniOd && isSameDate(dan, odabraniOd);
          const selectedEnd = odabraniDo && isSameDate(dan, odabraniDo);
          const selectedRange = isInRange(dan, odabraniOd, odabraniDo);

          const q = new URLSearchParams();

          if (objektId) q.set("objektId", objektId);
          q.set("jedinicaId", jedinicaId);

          if (!odabraniOd || (odabraniOd && odabraniDo)) {
            q.set("od", iso);
          } else {
            if (dan > odabraniOd) {
              q.set("od", toInputDate(odabraniOd));
              q.set("do", iso);
            } else {
              q.set("od", iso);
            }
          }

          const green = "rgba(134,239,172,0.46)";
          const red = "rgba(217,83,79,0.48)";
          const purple = "rgba(139,92,246,0.36)";
          const blue = "rgba(59,130,246,0.40)";

          let background = green;
          let borderColor = "rgba(76,175,80,0.45)";
          let marker = "";
          let title = "Slobodno";

          if (odlazak && dolazak) {
            const bojaOdlazak = statusBoja(odlazak.status);
            const bojaDolazak = statusBoja(dolazak.status);

            background = diagonalBg(bojaOdlazak.bg, bojaDolazak.bg);
            borderColor = "rgba(255,255,255,0.18)";
            marker = "↔";
            title = "Istog dana odlazak i dolazak";
          } else if (odlazak) {
            const boja = statusBoja(odlazak.status);
            background = diagonalBg(boja.bg, green);
            borderColor = "rgba(255,255,255,0.18)";
            title = "Odlazak gosta / moguće novi dolazak";
          } else if (dolazak) {
            const boja = statusBoja(dolazak.status);
            background = diagonalBg(green, boja.bg);
            borderColor = "rgba(255,255,255,0.18)";
            title = "Dolazak gosta / moguće samo kao odlazak";
          }

          if (posebna) {
            background = purple;
            borderColor = "rgba(139,92,246,0.70)";
            marker = "P";
            title = "Već označena posebna prilika";
          }

          if (boravi) {
            const boja = statusBoja(boravi.status);

            return (
              <div
                key={iso}
                className="min-h-[60px] border-b border-r p-1 text-left"
                style={{
                  background: boja.bg || red,
                  borderColor: boja.border,
                  cursor: "not-allowed",
                }}
                title="Zauzeto rezervacijom"
              >
                <DayContent day={dan} price={cijena} marker={boja.marker} />
              </div>
            );
          }

          if (dolazak && !odabraniOd) {
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
                <DayContent day={dan} price={cijena} marker={marker || "X"} />
              </div>
            );
          }

          if (selectedRange || selectedStart || selectedEnd) {
            background = blue;
            borderColor = "rgba(59,130,246,0.80)";
            title = "Odabrani termin";
            marker = selectedStart ? "OD" : selectedEnd ? "DO" : "";
          }

          return (
            <Link
              key={iso}
              href={`/admin/posebne-prilike?${q.toString()}#kalendar`}
              className="min-h-[60px] cursor-pointer border-b border-r p-1 text-left transition hover:brightness-105"
              style={{
                background,
                borderColor,
              }}
              title={title}
            >
              <DayContent day={dan} price={cijena} marker={marker} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DayContent({
  day,
  price,
  marker,
}: {
  day: Date;
  price: number;
  marker?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#2e2923]">
          {day.getDate()}
        </span>

        {marker && (
          <span className="text-[10px] font-black text-[#2e2923]">
            {marker}
          </span>
        )}
      </div>

      <div className="text-right text-[11px] font-black text-[#2e2923]">
        {price > 0 ? `${price.toFixed(0)} €` : "—"}
      </div>
    </div>
  );
}

function SidePanel({
  title,
  count,
  tone,
  items,
  promijeniAktivnost,
  promijeniWebPrikaz,
  obrisiPosebnuPriliku,
}: {
  title: string;
  count: number;
  tone: "active" | "past";
  items: any[];
  promijeniAktivnost: any;
  promijeniWebPrikaz: any;
  obrisiPosebnuPriliku: any;
}) {
  const styles =
    tone === "active"
      ? {
        header: "border-emerald-300 bg-emerald-50 text-emerald-900",
        card: "border-emerald-200 bg-[#f3faf5]",
      }
      : {
        header: "border-slate-300 bg-slate-100 text-slate-800",
        card: "border-slate-200 bg-slate-50",
      };

  return (
    <section className="border border-white/80 bg-white shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <div className={`border-b p-4 ${styles.header}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">{title}</h2>
          <span className="border border-current/20 bg-white/40 px-3 py-1 text-xs font-black">
            {count}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-4 text-sm text-[#8a8175]">Nema zapisa.</div>
      ) : (
        <div className="space-y-3 p-3">
          {items.map((a) => {
            const noci = brojNocenja(a.datumOd, a.datumDo);

            return (
              <div key={a.id} className={`border p-3 ${styles.card}`}>
                <div className="font-black text-[#2e2923]">
                  {a.naziv || "Posebna prilika"}
                </div>

                <div className="mt-1 text-xs text-[#6f665a]">
                  {a.jedinica.objekt.naziv} / {a.jedinica.naziv}
                </div>

                <div className="mt-2 text-xs">
                  {formatDate(a.datumOd)} – {formatDate(a.datumDo)} · {noci}{" "}
                  noći · {kapacitetLabel(a.jedinica)}
                </div>

                <div className="mt-2 text-lg font-black text-[#2e2923]">
                  {money(a.cijenaUkupno)}
                </div>

                {a.opis && (
                  <div className="mt-2 text-xs text-[#6f665a]">{a.opis}</div>
                )}

                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="border border-[#e2d8c8] bg-white px-2 py-1 text-[11px] font-black text-[#6f665a]">
                    {a.aktivna ? "Aktivna" : "Ugašena"}
                  </span>
                  <span className="border border-[#e2d8c8] bg-white px-2 py-1 text-[11px] font-black text-[#6f665a]">
                    {a.prikaziNaWebu ? "Na webu" : "Skrivena"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={webRezervacijaLink(a)}
                    target="_blank"
                    className="border border-[#caa870] bg-[#fff6e2] px-3 py-2 text-xs font-black text-[#7a5a22] hover:bg-[#f8f3ea]"
                  >
                    Test
                  </Link>

                  <form action={promijeniAktivnost}>
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      type="hidden"
                      name="aktivna"
                      value={String(!a.aktivna)}
                    />
                    <button className="border border-[#e2d8c8] bg-white px-3 py-2 text-xs font-black text-[#6f665a] hover:bg-[#f8f3ea]">
                      {a.aktivna ? "Ugasi" : "Aktiviraj"}
                    </button>
                  </form>

                  <form action={promijeniWebPrikaz}>
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      type="hidden"
                      name="prikaziNaWebu"
                      value={String(!a.prikaziNaWebu)}
                    />
                    <button
                      className={`px-3 py-2 text-xs font-black ${a.prikaziNaWebu
                        ? "border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                    >
                      {a.prikaziNaWebu ? "WEB UKLJUČEN" : "WEB ISKLJUČEN"}
                    </button>
                  </form>

                  <form action={obrisiPosebnuPriliku}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">
                      Obriši
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 border border-[#e2d8c8] bg-white p-3 text-sm font-black text-[#2e2923]">
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