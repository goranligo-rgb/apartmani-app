import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

const UI_COLORS = {
  slobodno: "hsl(140, 80%, 60%)",
  slobodnoBorder: "hsl(140, 80%, 35%)",

  zauzeto: "hsl(0, 91%, 55%)",
  zauzetoBorder: "hsl(0, 85%, 35%)",

  odabrano: "#8f7df0",
  odabranoBorder: "#6f5ce0",

  gold: "#c79a57",
  goldSoft: "rgba(199, 154, 87, 0.18)",
  dark: "#0b252b",
};

const OZNAKE_GOSTA = [
  "VIP",
  "SUPER_GOST",
  "POVRATNI_GOST",
  "ZAHTJEVAN",
  "NEUREDAN",
  "KASNI_S_PLACANJEM",
  "PROBLEMATICAN",
];

function parseOznake(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function safeJson(value?: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatJsonDate(value?: string | Date | null) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatJsonMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) return String(value);

  return `${n.toFixed(2)} €`;
}

function parseAmount(value: FormDataEntryValue | null) {
  const raw = String(value || "0").replace(",", ".").trim();
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Iznos mora biti veći od 0.");
  }

  return n;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("Neispravan datum.");
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

async function izracunajPlaceno(rezervacijaId: string) {
  const placanja = await prisma.placanje.findMany({
    where: {
      rezervacijaId,
      status: "PLACENO",
      tip: {
        not: "POVRAT",
      },
    },
  });

  const povrati = await prisma.placanje.findMany({
    where: {
      rezervacijaId,
      tip: "POVRAT",
    },
  });

  const ukupnoPlaceno = placanja.reduce(
    (sum, p) => sum + Number(p.iznos || 0),
    0
  );

  const ukupnoPovrat = povrati.reduce(
    (sum, p) => sum + Number(p.iznos || 0),
    0
  );

  return Math.max(ukupnoPlaceno - ukupnoPovrat, 0);
}

async function osvjeziStatusPlacanja(rezervacijaId: string) {
  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id: rezervacijaId },
  });

  if (!rezervacija) return;

  const ukupno = Number(
    rezervacija.dogovoreniIznos ||
      rezervacija.iznosUkupno ||
      rezervacija.iznosOsnovni ||
      0
  );

  const placeno = await izracunajPlaceno(rezervacijaId);
  const ostatak = Math.max(ukupno - placeno, 0);

  let noviStatus = rezervacija.status;

  if (rezervacija.status !== "OTKAZANO") {
    if (ukupno > 0 && placeno >= ukupno) {
      noviStatus = "PLACENO";
    } else if (placeno > 0) {
      noviStatus = "CEKA_OSTATAK";
    } else if (
      rezervacija.status === "CEKA_POTVRDU" ||
      rezervacija.status === "UPIT"
    ) {
      noviStatus = "CEKA_AKONTACIJU";
    }
  }

  await prisma.rezervacija.update({
    where: { id: rezervacijaId },
    data: {
      iznosPlaceno: placeno,
      iznosOstatka: ostatak,
      status: noviStatus,
    },
  });
}

export default async function RezervacijaDetaljPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;

  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id },
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
      racuni: {
        orderBy: { createdAt: "desc" },
      },
      emailovi: {
        orderBy: { createdAt: "desc" },
      },
      promjene: {
        orderBy: { createdAt: "desc" },
      },
      zadaci: {
        orderBy: { datum: "asc" },
      },
    },
  });

  if (!rezervacija) notFound();

  const ukupno = Number(
    rezervacija.dogovoreniIznos ||
      rezervacija.iznosUkupno ||
      rezervacija.iznosOsnovni ||
      0
  );

  const placeno = Number(rezervacija.iznosPlaceno || 0);
  const ostatak = Math.max(ukupno - placeno, 0);

  const popust =
    Number(rezervacija.popustIznos || 0) ||
    (Number(rezervacija.iznosOsnovni || 0) *
      Number(rezervacija.popustPostotak || 0)) /
      100;

  const predlozenoZaStorno =
    rezervacija.status !== "OTKAZANO" &&
    placeno <= 0 &&
    !!rezervacija.rokUplateAkontacije &&
    startOfDay(rezervacija.rokUplateAkontacije).getTime() <
      startOfDay(new Date()).getTime();

  const gostOznake = parseOznake(rezervacija.gost?.oznake);

  const gostUpozorenje =
    gostOznake.includes("NEUREDAN") ||
    gostOznake.includes("PROBLEMATICAN") ||
    gostOznake.includes("KASNI_S_PLACANJEM") ||
    gostOznake.includes("ZAHTJEVAN");

  async function evidentirajUplatu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));
    const tip = String(formData.get("tip") || "AKONTACIJA") as
      | "AKONTACIJA"
      | "OSTATAK"
      | "RAZLIKA"
      | "CIJELI_IZNOS";

    const nacinPlacanja = String(
      formData.get("nacinPlacanja") || "TEKUCI_RACUN"
    );

    const napomena = String(formData.get("napomena") || "").trim();

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    await prisma.placanje.create({
      data: {
        rezervacijaId,
        tip,
        status: "PLACENO",
        iznos,
        valuta: "EUR",
        nacinPlacanja,
        napomena,
        placenoAt: new Date(),
      },
    });

    await osvjeziStatusPlacanja(rezervacijaId);

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "UPLATA",
        opis: `Evidentirana uplata: ${iznos.toFixed(2)} €`,
        razlog: napomena || null,
        noviPodaci: JSON.stringify({
          iznos,
          tip,
          nacinPlacanja,
          napomena,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function kreirajZahtjevZaUplatu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));
    const tip = String(formData.get("tip") || "AKONTACIJA") as
      | "AKONTACIJA"
      | "OSTATAK"
      | "RAZLIKA";

    const rokRaw = String(formData.get("rokUplate") || "");
    const napomena = String(formData.get("napomena") || "").trim();

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: { gost: true },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const rokUplateAkontacije = rokRaw ? parseDateOnly(rokRaw) : null;

    await prisma.placanje.create({
      data: {
        rezervacijaId,
        tip,
        status: "ZAHTJEV_POSLAN",
        iznos,
        valuta: "EUR",
        nacinPlacanja: "TEKUCI_RACUN",
        napomena,
      },
    });

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        status: tip === "AKONTACIJA" ? "CEKA_AKONTACIJU" : "CEKA_OSTATAK",
        rokUplateAkontacije,
      },
    });

    await prisma.emailLog.create({
      data: {
        rezervacijaId,
        to: r.gost?.email || "bez-emaila",
        subject:
          tip === "AKONTACIJA"
            ? "Zahtjev za uplatu akontacije"
            : tip === "RAZLIKA"
            ? "Zahtjev za uplatu razlike"
            : "Zahtjev za uplatu ostatka",
        tip:
          tip === "AKONTACIJA"
            ? "ZAHTJEV_AKONTACIJA"
            : tip === "RAZLIKA"
            ? "ZAHTJEV_RAZLIKA"
            : "ZAHTJEV_OSTATAK",
        status: r.gost?.email ? "POSLANO" : "GRESKA",
        greska: r.gost?.email
          ? null
          : "Gost nema upisanu email adresu. Mail nije stvarno poslan.",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "ZAHTJEV_ZA_UPLATU",
        opis: `Kreiran zahtjev za uplatu: ${iznos.toFixed(2)} €`,
        razlog: napomena || null,
        noviPodaci: JSON.stringify({
          iznos,
          tip,
          rokUplate: rokRaw || null,
          napomena,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije/naplata");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function generirajRacun(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const iznos = parseAmount(formData.get("iznos"));

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const objekt = r.jedinica.objekt;
    const godina = new Date().getFullYear();
    const prefix = objekt.prefixRacuna || "RAC";

    const brojPostojecih = await prisma.racun.count({
      where: {
        objektId: objekt.id,
      },
    });

    const brojRacuna = `${prefix}-${godina}-${String(
      brojPostojecih + 1
    ).padStart(4, "0")}`;

    await prisma.racun.create({
      data: {
        rezervacijaId,
        objektId: objekt.id,
        brojRacuna,
        iznos,
        valuta: "EUR",

        nazivIzdavatelja: objekt.nazivZaRacun || objekt.naziv,
        oibIzdavatelja: objekt.oibZaRacun || null,
        adresaIzdavatelja: objekt.adresaZaRacun || null,
        mjestoIzdavatelja: objekt.mjestoZaRacun || objekt.mjesto || null,
        ibanIzdavatelja: objekt.ibanZaRacun || null,
        emailIzdavatelja: objekt.emailZaRacun || null,
        telefonIzdavatelja: objekt.telefonZaRacun || null,

        pdfUrl: null,
        poslanGostu: false,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "RACUN",
        opis: `Generiran račun ${brojRacuna} na iznos ${iznos.toFixed(2)} €`,
        noviPodaci: JSON.stringify({
          brojRacuna,
          iznos,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function oznaciRacunPoslan(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const racunId = String(formData.get("racunId") || "");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        racuni: true,
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    const racun = r.racuni.find((x) => x.id === racunId);
    if (!racun) throw new Error("Račun nije pronađen.");

    if (!r.gost?.email) {
      await prisma.emailLog.create({
        data: {
          rezervacijaId,
          to: "bez-emaila",
          subject: `Račun ${racun.brojRacuna}`,
          tip: "RACUN",
          status: "GRESKA",
          greska: "Gost nema upisanu email adresu.",
        },
      });

      revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
      redirect(`/admin/rezervacije/${rezervacijaId}`);
    }

    await prisma.racun.update({
      where: { id: racunId },
      data: {
        poslanGostu: true,
      },
    });

    await prisma.emailLog.create({
      data: {
        rezervacijaId,
        to: r.gost.email,
        subject: `Račun ${racun.brojRacuna}`,
        tip: "RACUN",
        status: "POSLANO",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "RACUN_MAIL",
        opis: `Račun ${racun.brojRacuna} označen kao poslan gostu na mail.`,
        noviPodaci: JSON.stringify({
          racunId,
          brojRacuna: racun.brojRacuna,
          email: r.gost.email,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function potvrdiStorno(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const razlog = String(formData.get("razlog") || "").trim();
    const potvrda = String(formData.get("potvrda") || "")
      .trim()
      .toUpperCase();

    if (potvrda !== "STORNO") {
      throw new Error("Za potvrdu storna morate upisati STORNO.");
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
    });

    if (!r) {
      throw new Error("Rezervacija nije pronađena.");
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        status: "OTKAZANO",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "STORNO_REZERVACIJE",
        opis: "Admin je ručno potvrdio storno rezervacije.",
        razlog:
          razlog ||
          "Rok akontacije je istekao, a uplata nije evidentirana.",
        stariPodaci: JSON.stringify({
          status: r.status,
          datumOd: r.datumOd,
          datumDo: r.datumDo,
          brojNocenja: r.brojNocenja,
          iznosUkupno: r.iznosUkupno,
          dogovoreniIznos: r.dogovoreniIznos,
          iznosPlaceno: r.iznosPlaceno,
          rokUplateAkontacije: r.rokUplateAkontacije,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiGosta(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const gostId = String(formData.get("gostId") || "");

    const napomena = String(formData.get("napomenaGosta") || "").trim();
    const oznake = formData.getAll("oznake").map(String).join(",");

    if (!gostId) {
      throw new Error("Gost nije pronađen.");
    }

    await prisma.gost.update({
      where: { id: gostId },
      data: {
        napomena,
        oznake,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "GOST_NAPOMENA",
        opis: "Ažurirane oznake i napomena gosta.",
        noviPodaci: JSON.stringify({
          oznake,
          napomena,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, rgba(199,154,87,0.35) 0%, transparent 30%), radial-gradient(circle at top right, rgba(11,37,43,0.85) 0%, transparent 34%), linear-gradient(135deg, #060816 0%, #0b1024 45%, #120818 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-white">
        <div className="mb-6 border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin/rezervacije"
                className="cursor-pointer text-sm font-black hover:text-white"
                style={{ color: "#f0d59b" }}
              >
                ← Sve rezervacije
              </Link>

              <h1 className="mt-4 text-4xl font-black">
                Admin detalj rezervacije
              </h1>

              <p className="mt-2 text-slate-300">
                {rezervacija.jedinica.objekt.naziv} /{" "}
                {rezervacija.jedinica.naziv}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                ID: {rezervacija.id}
              </p>
            </div>

            <div className="text-right">
              <div
                className="inline-block px-4 py-2 text-sm font-black text-white"
                style={{
                  backgroundColor:
                    rezervacija.status === "OTKAZANO"
                      ? UI_COLORS.zauzeto
                      : UI_COLORS.goldSoft,
                  border: `1px solid ${
                    rezervacija.status === "OTKAZANO"
                      ? UI_COLORS.zauzetoBorder
                      : UI_COLORS.gold
                  }`,
                }}
              >
                {rezervacija.status}
              </div>

              <div className="mt-2 text-xs font-bold text-slate-300">
                Izvor: {rezervacija.izvor}
              </div>
            </div>
          </div>

          {(rezervacija.izvor === "BOOKING" || rezervacija.izvor === "WEB") && (
            <div className="mt-5 border border-amber-300/40 bg-amber-300/15 p-4 text-sm font-bold text-amber-100">
              UPOZORENJE: ova rezervacija je kreirana putem{" "}
              {rezervacija.izvor}. Kod promjene termina, cijene, otkazivanja ili
              povrata treba dodatno provjeriti uplatu i vanjski sustav.
            </div>
          )}
        </div>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <Stat title="Ukupno" value={money(ukupno)} color="text-white" />
          <Stat title="Plaćeno" value={money(placeno)} color="text-white" />
          <Stat title="Ostatak" value={money(ostatak)} color="text-amber-200" />
          <Stat title="Popust" value={money(popust)} color="text-white" />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card title="Gost">
            {gostUpozorenje && (
              <div
                className="mb-4 border p-3 text-sm font-black text-white"
                style={{
                  backgroundColor: UI_COLORS.zauzeto,
                  borderColor: UI_COLORS.zauzetoBorder,
                }}
              >
                ⚠ Pažnja — gost ima oznaku: {gostOznake.join(", ")}
              </div>
            )}

            <Detail
              label="Ime"
              value={`${rezervacija.gost?.ime || "Gost"} ${
                rezervacija.gost?.prezime || ""
              }`}
            />
            <Detail label="Email" value={rezervacija.gost?.email || "-"} />
            <Detail label="Telefon" value={rezervacija.gost?.telefon || "-"} />

            {gostOznake.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {gostOznake.map((oznaka) => (
                  <span
                    key={oznaka}
                    className="border px-3 py-1 text-xs font-black"
                    style={{
                      backgroundColor:
                        oznaka === "NEUREDAN" ||
                        oznaka === "PROBLEMATICAN" ||
                        oznaka === "KASNI_S_PLACANJEM"
                          ? "rgba(239, 68, 68, 0.25)"
                          : UI_COLORS.goldSoft,
                      borderColor:
                        oznaka === "NEUREDAN" ||
                        oznaka === "PROBLEMATICAN" ||
                        oznaka === "KASNI_S_PLACANJEM"
                          ? UI_COLORS.zauzetoBorder
                          : UI_COLORS.gold,
                      color: "#fff",
                    }}
                  >
                    {oznaka}
                  </span>
                ))}
              </div>
            )}

            <Detail
              label="Napomena gosta"
              value={rezervacija.gost?.napomena || "-"}
            />

            {rezervacija.gost && (
              <form
                action={spremiGosta}
                className="mt-5 border border-white/10 bg-black/20 p-4"
              >
                <input
                  type="hidden"
                  name="rezervacijaId"
                  value={rezervacija.id}
                />
                <input type="hidden" name="gostId" value={rezervacija.gost.id} />

                <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                  Oznake gosta
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {OZNAKE_GOSTA.map((oznaka) => (
                    <label
                      key={oznaka}
                      className="flex cursor-pointer items-center gap-2 border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white"
                    >
                      <input
                        type="checkbox"
                        name="oznake"
                        value={oznaka}
                        defaultChecked={gostOznake.includes(oznaka)}
                      />
                      {oznaka}
                    </label>
                  ))}
                </div>

                <Field label="Interna napomena o gostu">
                  <textarea
                    name="napomenaGosta"
                    rows={4}
                    defaultValue={rezervacija.gost.napomena || ""}
                    className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                    placeholder="Npr. super gost, uredan, kasni s uplatom, traži raniji ulazak..."
                  />
                </Field>

                <button
                  className="mt-3 cursor-pointer border px-4 py-3 text-sm font-black transition hover:brightness-95"
                  style={{
                    backgroundColor: UI_COLORS.goldSoft,
                    borderColor: UI_COLORS.gold,
                    color: "#f7dfaa",
                  }}
                >
                  Spremi podatke o gostu
                </button>
              </form>
            )}

            <div className="mt-4">
              <Link
                href={`/admin/rezervacije/${rezervacija.id}/promjena-termina`}
                className="inline-block cursor-pointer border border-amber-300 bg-amber-300/20 px-4 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-300/30 hover:text-white"
              >
                Gost traži promjenu termina
              </Link>
            </div>
          </Card>

          <Card title="Termin">
            <Detail label="Dolazak" value={formatDate(rezervacija.datumOd)} />
            <Detail label="Odlazak" value={formatDate(rezervacija.datumDo)} />
            <Detail label="Noćenja" value={`${rezervacija.brojNocenja}`} />
            <Detail label="Broj osoba" value={`${rezervacija.brojOsoba}`} />
          </Card>

          <Card title="Cijena i status">
            <Detail label="Status" value={rezervacija.status} />
            <Detail label="Izvor" value={rezervacija.izvor} />
            <Detail
              label="Osnovni iznos"
              value={money(rezervacija.iznosOsnovni)}
            />
            <Detail
              label="Dogovoreni iznos"
              value={money(
                rezervacija.dogovoreniIznos || rezervacija.iznosUkupno
              )}
            />
            <Detail
              label="Rok uplate"
              value={formatDate(rezervacija.rokUplateAkontacije)}
            />
          </Card>
        </section>

        {predlozenoZaStorno && (
          <section
            className="mb-6 border-2 p-5 text-white shadow-[0_14px_35px_rgba(0,0,0,0.08)]"
            style={{
              backgroundColor: UI_COLORS.zauzeto,
              borderColor: UI_COLORS.zauzetoBorder,
            }}
          >
            <div className="text-sm font-black uppercase tracking-[0.16em]">
              ⚠ Predloženo za storno
            </div>

            <h2 className="mt-1 text-2xl font-black">
              Rok akontacije je istekao
            </h2>

            <p className="mt-2 text-sm">
              Uplata nije evidentirana. Prije storna obavezno provjeriti
              telefonski s gostom. Ako je dogovoreno da se rezervacija otkaže,
              potvrdi storno dolje.
            </p>

            <form action={potvrdiStorno} className="mt-5 space-y-3">
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-[0.14em]">
                  Razlog storna
                </div>

                <textarea
                  name="razlog"
                  rows={3}
                  className="w-full border border-white/40 bg-white px-3 py-2 text-red-900 outline-none"
                  placeholder="Npr. gost nije uplatio akontaciju u roku, provjereno telefonski..."
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-[0.14em]">
                  Za potvrdu upiši: STORNO
                </div>

                <input
                  name="potvrda"
                  required
                  placeholder="STORNO"
                  className="w-full border border-white/40 bg-white px-3 py-2 font-black text-red-900 outline-none"
                />
              </label>

              <button
                className="cursor-pointer border px-5 py-3 text-sm font-black text-white hover:brightness-95"
                style={{
                  backgroundColor: UI_COLORS.zauzetoBorder,
                  borderColor: UI_COLORS.zauzetoBorder,
                }}
              >
                Potvrdi storno rezervacije
              </button>
            </form>
          </section>
        )}

        {rezervacija.napomena && (
          <section className="mb-6 border border-white/15 bg-white/10 p-4 text-sm text-slate-200 backdrop-blur-xl">
            <div
              className="mb-1 text-xs font-black uppercase tracking-[0.18em]"
              style={{ color: "#f0d59b" }}
            >
              Napomena rezervacije
            </div>
            {rezervacija.napomena}
          </section>
        )}

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <Card title="Evidentiraj uplatu">
            <form action={evidentirajUplatu} className="space-y-3">
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Iznos">
                  <input
                    name="iznos"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={ostatak > 0 ? ostatak.toFixed(2) : ""}
                    className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                    required
                  />
                </Field>

                <Field label="Tip uplate">
                  <select
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                    className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                  >
                    <option value="AKONTACIJA">Akontacija</option>
                    <option value="OSTATAK">Ostatak</option>
                    <option value="RAZLIKA">Razlika</option>
                    <option value="CIJELI_IZNOS">Cijeli iznos</option>
                  </select>
                </Field>
              </div>

              <Field label="Način plaćanja">
                <select
                  name="nacinPlacanja"
                  defaultValue="TEKUCI_RACUN"
                  className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                >
                  <option value="TEKUCI_RACUN">
                    Tekući račun / uplata na račun
                  </option>
                  <option value="KARTICA">Kartica</option>
                  <option value="GOTOVINA">Gotovina</option>
                  <option value="BOOKING">Booking naplata</option>
                  <option value="OSTALO">Ostalo</option>
                </select>
              </Field>

              <Field label="Napomena">
                <textarea
                  name="napomena"
                  rows={3}
                  className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                  placeholder="Npr. uplata vidljiva na računu, dogovor s gostom..."
                />
              </Field>

              <button
                className="cursor-pointer border px-4 py-3 text-sm font-black text-white transition hover:brightness-95"
                style={{
                  backgroundColor: UI_COLORS.slobodno,
                  borderColor: UI_COLORS.slobodnoBorder,
                  color: "#12351a",
                }}
              >
                Evidentiraj uplatu
              </button>
            </form>
          </Card>

          <Card title="Zahtjev za uplatu">
            <form action={kreirajZahtjevZaUplatu} className="space-y-3">
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Iznos za uplatu">
                  <input
                    name="iznos"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={
                      placeno > 0
                        ? ostatak.toFixed(2)
                        : Number(rezervacija.iznosPotvrde || 0).toFixed(2)
                    }
                    className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                    required
                  />
                </Field>

                <Field label="Vrsta zahtjeva">
                  <select
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                    className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                  >
                    <option value="AKONTACIJA">Akontacija</option>
                    <option value="OSTATAK">Ostatak</option>
                    <option value="RAZLIKA">Razlika</option>
                  </select>
                </Field>
              </div>

              <Field label="Rok uplate">
                <input
                  name="rokUplate"
                  type="date"
                  className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </Field>

              <Field label="Napomena za zahtjev">
                <textarea
                  name="napomena"
                  rows={3}
                  className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                  placeholder="Npr. molimo uplatu akontacije za potvrdu rezervacije..."
                />
              </Field>

              <button
                className="cursor-pointer border px-4 py-3 text-sm font-black text-white transition hover:brightness-95"
                style={{
                  backgroundColor: UI_COLORS.goldSoft,
                  borderColor: UI_COLORS.gold,
                  color: "#f7dfaa",
                }}
              >
                Kreiraj zahtjev za uplatu
              </button>

              <p className="text-xs text-slate-400">
                Ovo zasad zapisuje zahtjev i email log. Stvarno slanje maila
                spojit ćemo na mail servis.
              </p>
            </form>
          </Card>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <Card title="Plaćanja">
            {rezervacija.placanja.length === 0 ? (
              <Empty text="Nema evidentiranih plaćanja." />
            ) : (
              <div className="space-y-2">
                {rezervacija.placanja.map((p) => (
                  <div
                    key={p.id}
                    className="border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black">
                          {p.tip} · {p.status}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatDateTime(p.createdAt)}
                        </div>
                      </div>

                      <div
                        className="text-right font-black"
                        style={{ color: UI_COLORS.slobodno }}
                      >
                        {money(p.iznos)}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-300">
                      Način: {p.nacinPlacanja || p.provider || "-"}
                    </div>

                    {p.napomena && (
                      <div className="mt-2 bg-white/10 p-2 text-xs text-slate-200">
                        {p.napomena}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Računi">
            <form
              action={generirajRacun}
              className="mb-4 border border-white/10 bg-black/20 p-3"
            >
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  name="iznos"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={ukupno.toFixed(2)}
                  className="w-full border border-white/15 bg-black/25 px-3 py-2 text-white outline-none"
                  required
                />

                <button
                  className="cursor-pointer border px-4 py-2 text-sm font-black transition hover:brightness-95"
                  style={{
                    backgroundColor: UI_COLORS.goldSoft,
                    borderColor: UI_COLORS.gold,
                    color: "#f7dfaa",
                  }}
                >
                  Generiraj račun
                </button>
              </div>
            </form>

            {rezervacija.racuni.length === 0 ? (
              <Empty text="Nema generiranih računa." />
            ) : (
              <div className="space-y-2">
                {rezervacija.racuni.map((racun) => (
                  <div
                    key={racun.id}
                    className="border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black">{racun.brojRacuna}</div>
                        <div className="text-xs text-slate-400">
                          {formatDateTime(racun.createdAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-black text-white">
                          {money(racun.iznos)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {racun.poslanGostu ? "Poslan gostu" : "Nije poslan"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {racun.pdfUrl ? (
                        <Link
                          href={racun.pdfUrl}
                          target="_blank"
                          className="cursor-pointer border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/20"
                        >
                          Otvori PDF
                        </Link>
                      ) : (
                        <span className="border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-slate-400">
                          PDF još nije generiran
                        </span>
                      )}

                      <form action={oznaciRacunPoslan}>
                        <input
                          type="hidden"
                          name="rezervacijaId"
                          value={rezervacija.id}
                        />
                        <input type="hidden" name="racunId" value={racun.id} />

                        <button
                          className="cursor-pointer border px-3 py-2 text-xs font-black hover:brightness-95"
                          style={{
                            backgroundColor: UI_COLORS.goldSoft,
                            borderColor: UI_COLORS.gold,
                            color: "#f7dfaa",
                          }}
                        >
                          Označi / pošalji račun na mail
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <Card title="Email log">
            {rezervacija.emailovi.length === 0 ? (
              <Empty text="Nema zapisa o emailovima." />
            ) : (
              <div className="space-y-2">
                {rezervacija.emailovi.map((e) => (
                  <div
                    key={e.id}
                    className="border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black">{e.subject}</div>
                        <div className="text-xs text-slate-400">
                          {e.to} · {e.tip}
                        </div>
                      </div>

                      <div
                        className="text-xs font-black"
                        style={{ color: "#f0d59b" }}
                      >
                        {e.status}
                      </div>
                    </div>

                    {e.greska && (
                      <div
                        className="mt-2 p-2 text-xs text-white"
                        style={{ backgroundColor: "rgba(239, 68, 68, 0.20)" }}
                      >
                        {e.greska}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-slate-500">
                      {formatDateTime(e.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Povijest promjena">
            {rezervacija.promjene.length === 0 ? (
              <Empty text="Nema promjena." />
            ) : (
              <div className="space-y-2">
                {rezervacija.promjene.map((p) => {
                  const stari = safeJson(p.stariPodaci);
                  const novi = safeJson(p.noviPodaci);

                  return (
                    <details
                      key={p.id}
                      className="border border-white/10 bg-black/20 p-3"
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <div className="font-black text-white">{p.tip}</div>

                            <div className="text-xs text-slate-300">
                              {p.opis || "-"}
                            </div>

                            <div
                              className="mt-1 text-xs"
                              style={{ color: "#f0d59b" }}
                            >
                              Tko: {p.korisnikIme || "Nepoznato"}
                            </div>
                          </div>

                          <div className="text-right text-xs text-slate-400">
                            {formatDateTime(p.createdAt)}
                            <div className="mt-1 font-black text-amber-100">
                              Klikni za detalje
                            </div>
                          </div>
                        </div>
                      </summary>

                      <div className="mt-4 border-t border-white/10 pt-4">
                        {p.razlog && (
                          <div className="mb-4 border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                            <div className="text-xs font-black uppercase tracking-[0.14em]">
                              Razlog promjene
                            </div>
                            <div className="mt-1">{p.razlog}</div>
                          </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-2">
                          <div
                            className="border p-3"
                            style={{
                              backgroundColor: "rgba(239, 68, 68, 0.14)",
                              borderColor: UI_COLORS.zauzetoBorder,
                            }}
                          >
                            <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-red-100">
                              Prije promjene
                            </div>

                            {stari ? (
                              <div className="space-y-2 text-sm">
                                <ChangeRow
                                  label="Dolazak"
                                  value={formatJsonDate(stari.datumOd)}
                                />
                                <ChangeRow
                                  label="Odlazak"
                                  value={formatJsonDate(stari.datumDo)}
                                />
                                <ChangeRow
                                  label="Noćenja"
                                  value={stari.brojNocenja ?? "-"}
                                />
                                <ChangeRow
                                  label="Ukupno"
                                  value={formatJsonMoney(
                                    stari.ukupno || stari.iznosUkupno
                                  )}
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                Nema detaljnih starih podataka.
                              </p>
                            )}
                          </div>

                          <div
                            className="border p-3"
                            style={{
                              backgroundColor: "rgba(74, 222, 128, 0.14)",
                              borderColor: UI_COLORS.slobodnoBorder,
                            }}
                          >
                            <div
                              className="mb-2 text-xs font-black uppercase tracking-[0.14em]"
                              style={{ color: UI_COLORS.slobodno }}
                            >
                              Nakon promjene
                            </div>

                            {novi ? (
                              <div className="space-y-2 text-sm">
                                <ChangeRow
                                  label="Dolazak"
                                  value={formatJsonDate(novi.datumOd)}
                                />
                                <ChangeRow
                                  label="Odlazak"
                                  value={formatJsonDate(novi.datumDo)}
                                />
                                <ChangeRow
                                  label="Noćenja"
                                  value={novi.brojNocenja ?? "-"}
                                />
                                <ChangeRow
                                  label="Osnovna cijena"
                                  value={formatJsonMoney(novi.iznosOsnovni)}
                                />
                                <ChangeRow
                                  label="Ukupno"
                                  value={formatJsonMoney(
                                    novi.ukupno || novi.iznosUkupno
                                  )}
                                />
                                <ChangeRow
                                  label="Plaćeno"
                                  value={formatJsonMoney(
                                    novi.placeno || novi.iznosPlaceno
                                  )}
                                />
                                <ChangeRow
                                  label="Ostatak"
                                  value={formatJsonMoney(
                                    novi.ostatak || novi.iznosOstatka
                                  )}
                                />
                                <ChangeRow
                                  label="Razlika"
                                  value={formatJsonMoney(novi.razlika)}
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                Nema detaljnih novih podataka.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-slate-500">
                          ID promjene: {p.id}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="border border-white/15 bg-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/15 bg-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <h2 className="mb-4 text-xl font-black text-white">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 border border-white/10 bg-black/20 p-3">
      <div
        className="text-[10px] font-black uppercase tracking-[0.15em]"
        style={{ color: "#f0d59b" }}
      >
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-white">{value || "-"}</div>
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
      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-slate-300">
        {label}
      </div>
      {children}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400">{text}</p>;
}

function ChangeRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/10 pb-1">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-black text-white">
        {value === null || value === undefined || value === "" ? "-" : value}
      </span>
    </div>
  );
}