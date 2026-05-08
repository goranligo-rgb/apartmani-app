import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import CijenaPreview from "./CijenaPreview";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  jedinicaId?: string;
  od?: string;
  do?: string;
  mjesec?: string;
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

const COLOR_SLOBODNO = "rgba(134,239,172,0.46)";
const COLOR_REZERVIRANO = "rgba(245,158,11,0.32)";
const COLOR_POTVRDENO = "#ef1f1f";
const COLOR_BOOKING = "#a855f7";
const COLOR_BOOKING_BORDER = "#7e22ce";
const COLOR_NOVI_ODABIR = "rgba(59,130,246,0.55)";

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
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseMonth(value?: string | null) {
  if (!value) return null;

  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;

  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

function monthParam(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

function isInMiddleOfRange(day: Date, from?: Date | null, to?: Date | null) {
  if (!from || !to) return false;
  return day > from && day < to;
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

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || "0").replace(",", ".").trim();
  const n = Number(raw);

  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function parseRequiredMoney(value: FormDataEntryValue | null, label: string) {
  const n = parseMoney(value);

  if (n <= 0) {
    throw new Error(`${label} mora biti veći od 0.`);
  }

  return n;
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (postavke?.appUrl) return postavke.appUrl.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  return "http://localhost:3000";
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

function izracunajDogovorenuCijenu({
  osnovna,
  popustPostotak,
  rucnaCijena,
}: {
  osnovna: number;
  popustPostotak: number;
  rucnaCijena: number;
}) {
  if (rucnaCijena > 0) {
    return Number(rucnaCijena.toFixed(2));
  }

  if (popustPostotak > 0) {
    return Number((osnovna - (osnovna * popustPostotak) / 100).toFixed(2));
  }

  return Number(osnovna.toFixed(2));
}

function statusBoja(status: string, izvor?: string) {
  if (izvor === "BOOKING") {
    return {
      bg: COLOR_BOOKING,
      border: COLOR_BOOKING_BORDER,
      marker: "B",
    };
  }

  if (status === "CEKA_AKONTACIJU" || status === "REZERVIRANO") {
    return {
      bg: COLOR_REZERVIRANO,
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
      bg: COLOR_POTVRDENO,
      border: COLOR_POTVRDENO,
      marker: "X",
    };
  }

  return {
    bg: "rgba(234,179,8,0.30)",
    border: "rgba(234,179,8,0.65)",
    marker: "?",
  };
}

function diagonalBg(left: string, right: string) {
  return `linear-gradient(135deg, ${left} 0%, ${left} 49%, ${right} 51%, ${right} 100%)`;
}

export default async function NovaAdminRezervacijaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const odabranaJedinicaId = sp.jedinicaId || "";
  const odabraniOd = parseDateOnly(sp.od);
  const odabraniDo = parseDateOnly(sp.do);

  const danas = startOfDay(new Date());
  const prviMjesecDanas = new Date(danas.getFullYear(), danas.getMonth(), 1, 12);

  const mjesecIzParametra = parseMonth(sp.mjesec);
  const mjesecIzOdabira = odabraniOd
    ? new Date(odabraniOd.getFullYear(), odabraniOd.getMonth(), 1, 12)
    : null;

  const kalendarOd = mjesecIzParametra || mjesecIzOdabira || prviMjesecDanas;
  const kalendarDo = addMonths(kalendarOd, 3);

  const prevMonth = addMonths(kalendarOd, -1);
  const nextMonth = addMonths(kalendarOd, 1);

  function buildMonthHref(targetMonth: Date) {
    const q = new URLSearchParams();

    if (odabranaJedinicaId) q.set("jedinicaId", odabranaJedinicaId);
    if (odabraniOd) q.set("od", toIsoDate(odabraniOd));
    if (odabraniDo) q.set("do", toIsoDate(odabraniDo));
    q.set("mjesec", monthParam(targetMonth));

    return `/admin/rezervacije/nova?${q.toString()}#kalendar`;
  }

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

  const jedinica = odabranaJedinicaId
    ? await prisma.jedinica.findUnique({
        where: { id: odabranaJedinicaId },
        include: { objekt: true },
      })
    : null;

  const postavke =
    (await prisma.postavkeNaplate.findFirst({
      orderBy: { createdAt: "asc" },
    })) ||
    (await prisma.postavkeNaplate.create({
      data: {
        danaVrijediPozivAkontacije: 3,
        danaPrijeDolaskaSlanjeOstatka: 7,
        danaPrijeDolaskaMoraBitiPlaceno: 3,
        danaPrijeDolaskaPunaNaplata: 30,
        automatskiOtkaziBezAkontacije: true,
        automatskiSaljiPodsjetnikOstatka: true,
      },
    }));

  const rezervacije = jedinica
    ? await prisma.rezervacija.findMany({
        where: {
          jedinicaId: jedinica.id,
          status: {
            notIn: ["OTKAZANO", "OBRISANO"],
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

  const cjenici = jedinica
    ? await prisma.cjenik.findMany({
        where: {
          jedinicaId: jedinica.id,
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

  const mjeseci = [0, 1].map((i) => {
    const d = addMonths(kalendarOd, i);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });

  const brojNocenja =
    odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? countNights(odabraniOd, odabraniDo)
      : 0;

  const osnovnaCijena =
    jedinica && odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? await izracunajCijenuTermina({
          jedinicaId: jedinica.id,
          datumOd: odabraniOd,
          datumDo: odabraniDo,
        })
      : 0;

  const defaultAkontacijaPostotak = Number(jedinica?.postotakAkontacije || 30);
  const defaultAkontacija = Number(
    ((osnovnaCijena * defaultAkontacijaPostotak) / 100).toFixed(2)
  );

  const postojiPreklapanje =
    jedinica && odabraniOd && odabraniDo && odabraniOd < odabraniDo
      ? await prisma.rezervacija.findFirst({
          where: {
            jedinicaId: jedinica.id,
            status: {
              notIn: ["OTKAZANO", "OBRISANO"],
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

  async function kreirajAdminRezervaciju(formData: FormData) {
    "use server";

    const jedinicaId = String(formData.get("jedinicaId") || "");
    const datumOdRaw = String(formData.get("datumOd") || "");
    const datumDoRaw = String(formData.get("datumDo") || "");

    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();
    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();
    const brojOsoba = Number(formData.get("brojOsoba") || 1);

    const popustPostotak = parseMoney(formData.get("popustPostotak"));
    const rucnaDogovorenaCijena = parseMoney(formData.get("dogovoreniIznos"));
    const iznosAkontacije = parseRequiredMoney(
      formData.get("iznosAkontacije"),
      "Iznos akontacije"
    );

    const danaVrijediAkontacija = Number(
      formData.get("danaVrijediAkontacija") || 3
    );

    const danaPrijeDolaskaOstatak = Number(
      formData.get("danaPrijeDolaskaOstatak") || 7
    );

    const danaPrijeDolaskaPlaceno = Number(
      formData.get("danaPrijeDolaskaPlaceno") || 3
    );

    const razlogPopusta = String(formData.get("razlogPopusta") || "").trim();
    const napomena = String(formData.get("napomena") || "").trim();
    const nacinKreiranja = String(formData.get("nacinKreiranja") || "");
    const uplataSjelaIznos = parseMoney(formData.get("uplataSjelaIznos"));

    if (!jedinicaId || !datumOdRaw || !datumDoRaw || !ime) {
      throw new Error("Nedostaju obavezni podaci za rezervaciju.");
    }

    if (!Number.isFinite(danaVrijediAkontacija) || danaVrijediAkontacija < 1) {
      throw new Error("Poziv za akontaciju mora vrijediti barem 1 dan.");
    }

    if (
      !Number.isFinite(danaPrijeDolaskaOstatak) ||
      danaPrijeDolaskaOstatak < 0
    ) {
      throw new Error("Broj dana za plaćanje ostatka nije ispravan.");
    }

    if (
      !Number.isFinite(danaPrijeDolaskaPlaceno) ||
      danaPrijeDolaskaPlaceno < 0
    ) {
      throw new Error("Broj dana kada sve mora biti plaćeno nije ispravan.");
    }

    const datumOd = parseDateOnly(datumOdRaw);
    const datumDo = parseDateOnly(datumDoRaw);

    if (!datumOd || !datumDo || datumOd >= datumDo) {
      throw new Error("Datum odlaska mora biti nakon dolaska.");
    }

    const jedinica = await prisma.jedinica.findUnique({
      where: { id: jedinicaId },
      include: { objekt: true },
    });

    if (!jedinica) {
      throw new Error("Jedinica nije pronađena.");
    }

    const preklapanje = await prisma.rezervacija.findFirst({
      where: {
        jedinicaId,
        status: {
          notIn: ["OTKAZANO", "OBRISANO"],
        },
        datumOd: {
          lt: datumDo,
        },
        datumDo: {
          gt: datumOd,
        },
      },
    });

    if (preklapanje) {
      throw new Error("Odabrani termin je zauzet.");
    }

    const nocenja = countNights(datumOd, datumDo);

    const iznosOsnovni = await izracunajCijenuTermina({
      jedinicaId,
      datumOd,
      datumDo,
    });

    const dogovoreniIznos = izracunajDogovorenuCijenu({
      osnovna: iznosOsnovni,
      popustPostotak,
      rucnaCijena: rucnaDogovorenaCijena,
    });

    if (dogovoreniIznos <= 0) {
      throw new Error("Dogovoreni iznos mora biti veći od 0.");
    }

    if (iznosAkontacije > dogovoreniIznos) {
      throw new Error("Akontacija ne može biti veća od dogovorenog iznosa.");
    }

    const rokUplateAkontacije = addDays(
      startOfDay(new Date()),
      danaVrijediAkontacija
    );

    const rokUplateOstatka = addDays(datumOd, -danaPrijeDolaskaOstatak);

    let status: "CEKA_AKONTACIJU" | "REZERVIRANO" | "POTVRDENO" | "PLACENO" =
      "REZERVIRANO";

    let iznosPlaceno = 0;

    if (nacinKreiranja === "POZIV_KARTICA") {
      status = "CEKA_AKONTACIJU";
      iznosPlaceno = 0;
    } else if (nacinKreiranja === "BANKA_CEKA") {
      status = "REZERVIRANO";
      iznosPlaceno = 0;
    } else if (nacinKreiranja === "UPLATA_SJELA") {
      iznosPlaceno = Math.min(uplataSjelaIznos, dogovoreniIznos);
      status = iznosPlaceno >= dogovoreniIznos ? "PLACENO" : "POTVRDENO";
    } else {
      throw new Error("Odaberite način kreiranja rezervacije.");
    }

    let gost;

    if (email) {
      gost = await prisma.gost.upsert({
        where: {
          email,
        },
        update: {
          ime,
          prezime: prezime || null,
          telefon: telefon || null,
          adresa: adresa || null,
          grad: grad || null,
          drzava: drzava || null,
        },
        create: {
          ime,
          prezime: prezime || null,
          email,
          telefon: telefon || null,
          adresa: adresa || null,
          grad: grad || null,
          drzava: drzava || null,
        },
      });
    } else {
      gost = await prisma.gost.create({
        data: {
          ime,
          prezime: prezime || null,
          email: null,
          telefon: telefon || null,
          adresa: adresa || null,
          grad: grad || null,
          drzava: drzava || null,
        },
      });
    }

    const rezervacija = await prisma.rezervacija.create({
      data: {
        jedinicaId,
        gostId: gost.id,
        izvor: "ADMIN",
        status,
        datumOd,
        datumDo,
        brojNocenja: nocenja,
        brojOsoba,

        iznosOsnovni,
        popustPostotak: popustPostotak > 0 ? popustPostotak : null,
        popustIznos:
          popustPostotak > 0
            ? Number(((iznosOsnovni * popustPostotak) / 100).toFixed(2))
            : null,
        dogovoreniIznos,
        iznosUkupno: dogovoreniIznos,
        iznosPotvrde: iznosAkontacije,
        iznosPlaceno,
        iznosOstatka: Math.max(dogovoreniIznos - iznosPlaceno, 0),

        rokUplateAkontacije:
          nacinKreiranja === "UPLATA_SJELA" ? null : rokUplateAkontacije,
        rokUplateOstatka,

        danaVrijediAkontacija,
        danaPrijeDolaskaOstatak,
        danaPrijeDolaskaPlaceno,
        automatskoOtkazivanje: true,

        placenoKarticom: false,
        valuta: "EUR",
        razlogPopusta: razlogPopusta || null,
        napomena: napomena || null,
      },
    });

    if (nacinKreiranja === "POZIV_KARTICA") {
      const placanjeAkontacije = await prisma.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "POTVRDA_REZERVACIJE",
          status: "ZAHTJEV_POSLAN",
          iznos: iznosAkontacije,
          valuta: "EUR",
          nacinPlacanja: "KARTICA",
          provider: "TEST_KARTICA",
          napomena: `Poziv za kartično plaćanje akontacije. Rok uplate: ${rokUplateAkontacije.toLocaleDateString(
            "hr-HR"
          )}`,
        },
      });

      const baseUrl = await getAppUrl();
      const paymentLink = `${baseUrl}/placanje?placanjeId=${placanjeAkontacije.id}`;

      let mailStatus: "POSLANO" | "GRESKA" = "GRESKA";
      let mailGreska: string | null = null;

      if (!email) {
        mailGreska = "Gost nema email adresu. Mail nije poslan.";
      } else {
        const mail = await sendMail({
          to: email,
          subject: "Poziv za plaćanje akontacije",
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222; max-width: 640px;">
              <h2>Poziv za plaćanje akontacije</h2>
              <p>Poštovani ${ime}${prezime ? " " + prezime : ""},</p>
              <p>
                Vaša rezervacija je evidentirana za:
                <br />
                <strong>${jedinica.objekt.naziv} / ${jedinica.naziv}</strong>
              </p>
              <p>
                Termin:
                <br />
                <strong>${datumOd.toLocaleDateString("hr-HR")} – ${datumDo.toLocaleDateString("hr-HR")}</strong>
              </p>
              <p>
                Ukupan iznos rezervacije:
                <br />
                <strong>${dogovoreniIznos.toFixed(2)} €</strong>
              </p>
              <p>
                Za potvrdu rezervacije potrebno je platiti akontaciju:
                <br />
                <strong>${iznosAkontacije.toFixed(2)} €</strong>
              </p>
              <p>
                Rok plaćanja:
                <br />
                <strong>${rokUplateAkontacije.toLocaleDateString("hr-HR")}</strong>
              </p>
              <p style="margin: 28px 0;">
                <a href="${paymentLink}"
                   style="background:#c79a57;color:#ffffff;padding:14px 22px;text-decoration:none;font-weight:bold;display:inline-block;">
                  Plati akontaciju karticom
                </a>
              </p>
              <p style="font-size:13px;color:#666;">
                Ako gumb ne radi, kopirajte ovaj link u preglednik:<br/>
                ${paymentLink}
              </p>
              <p>
                Nakon uspješne uplate dobit ćete automatsku potvrdu rezervacije i račun.
              </p>
              <p>Srdačan pozdrav,<br/>Malinska Stay</p>
            </div>
          `,
        });

        if (mail.ok) {
          mailStatus = "POSLANO";
        } else {
          mailGreska = mail.error || "Greška kod slanja maila.";
        }
      }

      await prisma.emailLog.create({
        data: {
          rezervacijaId: rezervacija.id,
          to: email || "bez-emaila",
          subject: "Poziv za plaćanje akontacije",
          tip: "ZAHTJEV_AKONTACIJA",
          status: mailStatus,
          greska: mailGreska,
        },
      });
    }

    if (nacinKreiranja === "BANKA_CEKA") {
      await prisma.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip: "AKONTACIJA",
          status: "CEKA_PLACANJE",
          iznos: iznosAkontacije,
          valuta: "EUR",
          nacinPlacanja: "TEKUCI_RACUN",
          napomena:
            "Termin je rezerviran. Čeka se uplata preko banke / transakcijskog računa.",
        },
      });
    }

    if (nacinKreiranja === "UPLATA_SJELA") {
      await prisma.placanje.create({
        data: {
          rezervacijaId: rezervacija.id,
          tip:
            iznosPlaceno >= dogovoreniIznos
              ? "CIJELI_IZNOS"
              : "AKONTACIJA",
          status: "PLACENO",
          iznos: iznosPlaceno,
          valuta: "EUR",
          nacinPlacanja: "TEKUCI_RACUN",
          napomena:
            "Admin označio da je uplata sjela prilikom kreiranja rezervacije.",
          placenoAt: new Date(),
        },
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId: rezervacija.id,
          to: email || "bez-emaila",
          subject: "Potvrda rezervacije",
          tip: "POTVRDA_REZERVACIJE",
          status: email ? "POSLANO" : "GRESKA",
          greska: email
            ? null
            : "Gost nema email adresu. Mail nije stvarno poslan.",
        },
      });
    }

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId: rezervacija.id,
        tip: "KREIRANJE_ADMIN_REZERVACIJE",
        opis: `Admin kreirao rezervaciju. Način: ${nacinKreiranja}.`,
        razlog: napomena || razlogPopusta || null,
        noviPodaci: JSON.stringify({
          jedinicaId,
          objekt: jedinica.objekt.naziv,
          jedinica: jedinica.naziv,
          datumOd,
          datumDo,
          brojNocenja: nocenja,
          brojOsoba,
          gost: {
            ime,
            prezime,
            email,
            telefon,
            adresa,
            grad,
            drzava,
          },
          iznosOsnovni,
          popustPostotak,
          dogovoreniIznos,
          iznosAkontacije,
          iznosPlaceno,
          rokUplateAkontacije,
          rokUplateOstatka,
          danaVrijediAkontacija,
          danaPrijeDolaskaOstatak,
          danaPrijeDolaskaPlaceno,
          nacinKreiranja,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/monitor");
    revalidatePath("/admin/gosti");

    redirect(`/admin/rezervacije/${rezervacija.id}`);
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 48%, #eadfce 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl text-[#2e2923]">
        <div className="mb-6 border border-white/70 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin/rezervacije"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Sve rezervacije
          </Link>

          <h1 className="mt-4 text-4xl font-black">Nova admin rezervacija</h1>

          <p className="mt-2 text-[#6f665a]">
            Odaberi jedinicu, klikni datum dolaska i odlaska, provjeri cijenu,
            upiši gosta i način plaćanja.
          </p>
        </div>

        <section className="mb-6 grid gap-4 xl:grid-cols-[260px_1fr]">
          <aside className="border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
            <h2 className="text-xl font-black">Objekti i jedinice</h2>

            <div className="mt-4 space-y-4">
              {objekti.map((objekt) => (
                <div
                  key={objekt.id}
                  className="border border-[#e2d8c8] bg-[#fcfaf6] p-3"
                >
                  <div className="font-black text-[#7a5a22]">
                    {objekt.naziv}
                  </div>

                  <div className="mt-2 space-y-2">
                    {objekt.jedinice.map((j) => {
                      const q = new URLSearchParams();
                      q.set("jedinicaId", j.id);
                      q.set("mjesec", monthParam(kalendarOd));

                      return (
                        <Link
                          key={j.id}
                          href={`/admin/rezervacije/nova?${q.toString()}#kalendar`}
                          className={`block cursor-pointer border px-3 py-2 text-sm font-black transition ${
                            odabranaJedinicaId === j.id
                              ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                              : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                          }`}
                        >
                          {j.naziv}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section>
            {!jedinica ? (
              <div className="border border-white/70 bg-white p-6 text-[#6f665a] shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                Odaberi jedinicu s lijeve strane.
              </div>
            ) : (
              <>
                <div className="mb-4 border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                  <h2 className="text-2xl font-black">
                    {jedinica.objekt.naziv} / {jedinica.naziv}
                  </h2>
                  <p className="mt-1 text-sm text-[#6f665a]">
                    Zelena je slobodno, narančasto čeka uplatu, crveno je
                    potvrđeno/plaćeno, ljubičasto je Booking, plavo je novi
                    odabir.
                  </p>
                </div>

                <section className="mb-4 grid gap-3 md:grid-cols-5">
                  <Legend color="#86efac" label="Slobodno" />
                  <Legend color="#f59e0b" label="Rezervirano / čeka uplatu" />
                  <Legend color={COLOR_POTVRDENO} label="Potvrđeno / plaćeno" />
                  <Legend color={COLOR_BOOKING} label="Booking" />
                  <Legend color="#3b82f6" label="Novi odabrani termin" />
                </section>

                <div
                  id="kalendar"
                  className="mb-4 scroll-mt-40 border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(0,0,0,0.08)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={buildMonthHref(prevMonth)}
                      className="cursor-pointer border border-[#d8c8aa] bg-[#f8f3ea] px-4 py-2 text-lg font-black text-[#7a5a22] hover:bg-[#fff6e2]"
                    >
                      ←
                    </Link>

                    <div className="text-center">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                        Prikaz kalendara
                      </div>
                      <div className="mt-1 text-xl font-black capitalize text-[#2e2923]">
                        {monthLabel(kalendarOd)} /{" "}
                        {monthLabel(addMonths(kalendarOd, 1))}
                      </div>
                    </div>

                    <Link
                      href={buildMonthHref(nextMonth)}
                      className="cursor-pointer border border-[#d8c8aa] bg-[#f8f3ea] px-4 py-2 text-lg font-black text-[#7a5a22] hover:bg-[#fff6e2]"
                    >
                      →
                    </Link>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {mjeseci.map((mjesec) => (
                    <MonthCalendar
                      key={mjesec.toISOString()}
                      mjesec={mjesec}
                      mjesecParam={monthParam(kalendarOd)}
                      jedinicaId={jedinica.id}
                      rezervacije={rezervacije}
                      cjenici={cjenici}
                      odabraniOd={odabraniOd}
                      odabraniDo={odabraniDo}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </section>

        {jedinica && (
          <section className="mb-6 grid gap-4 xl:grid-cols-[1fr_460px]">
            <div className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
              <h2 className="text-xl font-black">Pregled odabranog termina</h2>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Info
                  label="Dolazak"
                  value={odabraniOd ? formatDate(odabraniOd) : "-"}
                />
                <Info
                  label="Odlazak"
                  value={odabraniDo ? formatDate(odabraniDo) : "-"}
                />
                <Info
                  label="Noćenja"
                  value={brojNocenja > 0 ? `${brojNocenja}` : "-"}
                />
                <Info
                  label="Cijena iz cjenika"
                  value={osnovnaCijena > 0 ? money(osnovnaCijena) : "-"}
                />
              </div>

              {postojiPreklapanje && (
                <div className="mt-5 border border-red-300 bg-red-50 p-4 text-sm font-black text-red-700">
                  Odabrani termin je zauzet. Odaberi drugi termin.
                  {postojiPreklapanje.izvor === "BOOKING" && (
                    <div className="mt-1 text-purple-800">
                      Termin je zauzet preko Booking rezervacije.
                    </div>
                  )}
                </div>
              )}
            </div>

            {odabraniOd &&
              odabraniDo &&
              odabraniOd < odabraniDo &&
              !postojiPreklapanje && (
                <aside className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                  <h2 className="text-xl font-black">Kreiraj rezervaciju</h2>

                  <form
                    action={kreirajAdminRezervaciju}
                    className="mt-4 space-y-4"
                  >
                    <input type="hidden" name="jedinicaId" value={jedinica.id} />
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

                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Ime">
                        <input
                          name="ime"
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                          required
                        />
                      </Field>

                      <Field label="Prezime">
                        <input
                          name="prezime"
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        />
                      </Field>
                    </div>

                    <Field label="Email">
                      <input
                        name="email"
                        type="email"
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>

                    <Field label="Telefon">
                      <input
                        name="telefon"
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Adresa">
                        <input
                          name="adresa"
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        />
                      </Field>

                      <Field label="Grad">
                        <input
                          name="grad"
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        />
                      </Field>

                      <Field label="Država">
                        <select
                          name="drzava"
                          defaultValue=""
                          className="w-full cursor-pointer border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        >
                          <option value="" disabled>
                            —
                          </option>

                          {DRZAVE.map((drzava) => (
                            <option key={drzava} value={drzava}>
                              {drzava}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field label="Broj osoba">
                      <input
                        name="brojOsoba"
                        type="number"
                        min={1}
                        max={jedinica.ukupniKapacitet || 20}
                        defaultValue={2}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <div className="border border-[#d8c8aa] bg-[#f8f3ea] p-3">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a641d]">
                        Cijena iz cjenika
                      </div>
                      <div className="mt-1 text-2xl font-black text-[#2e2923]">
                        {money(osnovnaCijena)}
                      </div>
                    </div>

                    <CijenaPreview
                      osnovnaCijena={osnovnaCijena}
                      defaultAkontacijaPostotak={defaultAkontacijaPostotak}
                    />

                    <Field label="Razlog popusta / dogovor">
                      <textarea
                        name="razlogPopusta"
                        rows={2}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        placeholder="npr. stari gost, telefonski dogovor..."
                      />
                    </Field>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Akontacija">
                        <input
                          name="iznosAkontacije"
                          type="number"
                          min={0.01}
                          step="0.01"
                          defaultValue={defaultAkontacija.toFixed(2)}
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                          required
                        />
                      </Field>

                      <Field label="Poziv vrijedi dana">
                        <input
                          name="danaVrijediAkontacija"
                          type="number"
                          min={1}
                          defaultValue={postavke.danaVrijediPozivAkontacije}
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                          required
                        />
                      </Field>

                      <Field label="Ostatak prije dolaska">
                        <input
                          name="danaPrijeDolaskaOstatak"
                          type="number"
                          min={0}
                          defaultValue={postavke.danaPrijeDolaskaSlanjeOstatka}
                          className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                          required
                        />
                      </Field>
                    </div>

                    <Field label="Sve mora biti plaćeno dana prije dolaska">
                      <input
                        name="danaPrijeDolaskaPlaceno"
                        type="number"
                        min={0}
                        defaultValue={postavke.danaPrijeDolaskaMoraBitiPlaceno}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                        required
                      />
                    </Field>

                    <Field label="Ako je uplata već sjela, upiši iznos">
                      <input
                        name="uplataSjelaIznos"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="npr. 300"
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>

                    <Field label="Napomena">
                      <textarea
                        name="napomena"
                        rows={3}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>

                    <div className="space-y-2">
                      <label className="flex cursor-pointer gap-3 border border-[#e2d8c8] bg-[#fff6e2] p-3">
                        <input
                          type="radio"
                          name="nacinKreiranja"
                          value="POZIV_KARTICA"
                          required
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-black text-[#7a5a22]">
                            Pošalji link za kartično plaćanje akontacije
                          </span>
                          <span className="text-sm text-[#6f665a]">
                            Gost dobiva mail s gumbom “Plati akontaciju karticom”.
                          </span>
                        </span>
                      </label>

                      <label className="flex cursor-pointer gap-3 border border-[#e2d8c8] bg-[#f8f3ea] p-3">
                        <input
                          type="radio"
                          name="nacinKreiranja"
                          value="BANKA_CEKA"
                          required
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-black text-[#7a5a22]">
                            Rezerviraj termin — uplata ide preko banke
                          </span>
                          <span className="text-sm text-[#6f665a]">
                            Termin je blokiran, ali uplata još nije sjela.
                          </span>
                        </span>
                      </label>

                      <label className="flex cursor-pointer gap-3 border border-[#cfe3d2] bg-[#f1fbf3] p-3">
                        <input
                          type="radio"
                          name="nacinKreiranja"
                          value="UPLATA_SJELA"
                          required
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-black text-[#2f6b3a]">
                            Uplata je već sjela — potvrdi odmah
                          </span>
                          <span className="text-sm text-[#6f665a]">
                            Admin upisuje iznos koji je stvarno sjeo.
                          </span>
                        </span>
                      </label>
                    </div>

                    <button className="w-full cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95">
                      Kreiraj admin rezervaciju
                    </button>
                  </form>
                </aside>
              )}
          </section>
        )}
      </div>
    </main>
  );
}

function MonthCalendar({
  mjesec,
  mjesecParam,
  jedinicaId,
  rezervacije,
  cjenici,
  odabraniOd,
  odabraniDo,
}: {
  mjesec: Date;
  mjesecParam: string;
  jedinicaId: string;
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
    <section className="border border-white/70 bg-white p-3 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
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

          const iso = toIsoDate(dan);
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

          const selectedStart = odabraniOd && isSameDate(dan, odabraniOd);
          const selectedEnd = odabraniDo && isSameDate(dan, odabraniDo);
          const selectedMiddle = isInMiddleOfRange(dan, odabraniOd, odabraniDo);

          const mozeBitiOdlazak =
            odabraniOd && !odabraniDo && dan > odabraniOd;

          const q = new URLSearchParams();
          q.set("jedinicaId", jedinicaId);
          q.set("mjesec", mjesecParam);

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

          let leftColor = COLOR_SLOBODNO;
          let rightColor = COLOR_SLOBODNO;
          let background = COLOR_SLOBODNO;
          let borderColor = "rgba(76,175,80,0.45)";
          let title = "Slobodno";
          let marker = "";

          if (odlazak && dolazak) {
            const bojaOdlazak = statusBoja(odlazak.status, odlazak.izvor);
            const bojaDolazak = statusBoja(dolazak.status, dolazak.izvor);

            leftColor = bojaOdlazak.bg;
            rightColor = bojaDolazak.bg;
            background = diagonalBg(leftColor, rightColor);
            borderColor = "rgba(255,255,255,0.18)";
            title = "Istog dana odlazak i dolazak";
            marker = "↔";
          } else if (odlazak) {
            const boja = statusBoja(odlazak.status, odlazak.izvor);

            leftColor = boja.bg;
            rightColor = COLOR_SLOBODNO;
            background = diagonalBg(leftColor, rightColor);
            borderColor = boja.border;
            title =
              odlazak.izvor === "BOOKING"
                ? "Booking odlazak / moguće novi dolazak"
                : "Odlazak gosta / moguće novi dolazak";
            marker = odlazak.izvor === "BOOKING" ? "B" : "";
          } else if (dolazak) {
            const boja = statusBoja(dolazak.status, dolazak.izvor);

            leftColor = COLOR_SLOBODNO;
            rightColor = boja.bg;
            background = diagonalBg(leftColor, rightColor);
            borderColor = boja.border;
            title =
              dolazak.izvor === "BOOKING"
                ? "Booking dolazak"
                : "Dolazak gosta / moguće samo kao odlazak";
            marker = dolazak.izvor === "BOOKING" ? "B" : "";
          }

          if (boravi && !selectedStart && !selectedEnd && !selectedMiddle) {
            const boja = statusBoja(boravi.status, boravi.izvor);

            return (
              <div
                key={iso}
                className="min-h-[60px] border-b border-r p-1 text-left"
                style={{
                  background: boja.bg,
                  borderColor: boja.border,
                  cursor: "not-allowed",
                }}
                title="Zauzeto drugom rezervacijom"
              >
                <DayContent day={dan} price={cijena} marker={boja.marker} />
              </div>
            );
          }

          if (dolazak && !mozeBitiOdlazak && !selectedStart && !selectedEnd) {
            const boja = statusBoja(dolazak.status, dolazak.izvor);

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
                <DayContent
                  day={dan}
                  price={cijena}
                  marker={marker || boja.marker}
                />
              </div>
            );
          }

          if (selectedStart) {
            background = diagonalBg(leftColor, COLOR_NOVI_ODABIR);
            borderColor = "rgba(59,130,246,0.90)";
            title = "Dolazak novog odabranog termina";
            marker = "OD";
          } else if (selectedEnd) {
            background = diagonalBg(COLOR_NOVI_ODABIR, rightColor);
            borderColor = "rgba(59,130,246,0.90)";
            title = "Odlazak novog odabranog termina";
            marker = "DO";
          } else if (selectedMiddle) {
            background = COLOR_NOVI_ODABIR;
            borderColor = "rgba(59,130,246,0.90)";
            title = "Novi odabrani termin";
            marker = "";
          }

          return (
            <Link
              key={iso}
              href={`/admin/rezervacije/nova?${q.toString()}#kalendar`}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e2d8c8] bg-[#fcfaf6] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-[#2e2923]">
        {value || "-"}
      </div>
    </div>
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
  children: ReactNode;
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