import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { stripe } from "@/lib/stripe";
import { dodajTtlockSifru } from "@/lib/ttlock";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

const resend = new Resend(process.env.RESEND_API_KEY);

function getMailFrom() {
  return process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>";
}

async function getAppUrl() {
  const postavke = await prisma.postavkeNaplate.findFirst();

  if (postavke?.appUrl) return postavke.appUrl;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

const UI_COLORS = {
  slobodno: "rgba(134,239,172,0.46)",
  slobodnoBorder: "rgba(34,197,94,0.65)",

  zauzeto: "#ef1f1f",
  zauzetoBorder: "#b91c1c",

  odabrano: "#8f7df0",
  odabranoBorder: "#6f5ce0",

  gold: "#c79a57",
  goldSoft: "rgba(199, 154, 87, 0.18)",
  dark: "#2e2923",
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

function generirajSifruIzTelefona(telefon?: string | null) {
  const brojevi = String(telefon || "").replace(/\D/g, "");
  if (brojevi.length >= 4) return brojevi.slice(-4);
  return String(Math.floor(1000 + Math.random() * 9000));
}

function setTime(date: Date, hour: number, minute: number) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function parseTime(value?: string | null) {
  const [h, m] = String(value || "").split(":").map(Number);
  return {
    hour: Number.isFinite(h) ? h : 16,
    minute: Number.isFinite(m) ? m : 0,
  };
}

function formatTime(value?: Date | null) {
  if (!value) return "16:00";
  return value.toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
      statusPrijeBrisanja: rezervacija.status,
      status: "OTKAZANO",
      obrisanoAt: new Date(),
      obrisaoKorisnik: "Admin",
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
          ttlockBrave: {
            include: {
              brava: true,
            },
          },
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
      ttlockSifre: {
        include: {
          brava: true,
        },
        orderBy: {
          createdAt: "asc",
        },
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

  const ttlockPrva = rezervacija.ttlockSifre?.[0];

  const ttlockSifra =
    ttlockPrva?.sifra || generirajSifruIzTelefona(rezervacija.gost?.telefon);

  const ttlockUlaz =
    ttlockPrva?.vrijediOd || setTime(rezervacija.datumOd, 16, 0);

  const ttlockIzlaz =
    ttlockPrva?.vrijediDo || setTime(rezervacija.datumDo, 10, 0);

  async function odbijRezervaciju(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: { include: { objekt: true } },
        placanja: true,
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");

    if (r.status === "OTKAZANO") {
      redirect(`/admin/rezervacije/${rezervacijaId}?odbijeno=1`);
    }

    if (r.status !== "CEKA_POTVRDU") {
      throw new Error("Rezervacija više ne čeka potvrdu.");
    }

    const stripePlacanje = r.placanja.find(
      (p) => p.provider === "STRIPE" && p.status !== "PLACENO"
    );

    if (stripePlacanje?.providerId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          stripePlacanje.providerId
        );

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (
            pi.status === "requires_capture" ||
            pi.status === "requires_payment_method" ||
            pi.status === "requires_confirmation" ||
            pi.status === "requires_action" ||
            pi.status === "processing"
          ) {
            await stripe.paymentIntents.cancel(paymentIntentId);
          }
        }

        await prisma.placanje.update({
          where: { id: stripePlacanje.id },
          data: {
            status: "OTKAZANO",
            napomena:
              "Stripe autorizacija je poništena jer je rezervacija odbijena.",
          },
        });
      } catch (error: any) {
        await prisma.placanje.update({
          where: { id: stripePlacanje.id },
          data: {
            status: "OTKAZANO",
            napomena: `Rezervacija je odbijena. Stripe provjera/cancel greška: ${error?.message || "Nepoznata greška"
              }`,
          },
        });
      }
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: { status: "OTKAZANO" },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "OTKAZIVANJE_REZERVACIJE",
        opis: "Admin je odbio web rezervaciju.",
        stariPodaci: JSON.stringify({
          status: r.status,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
          stripePlacanjeId: stripePlacanje?.id || null,
        }),
        korisnikIme: "Admin",
      },
    });

    if (r.gost?.email) {
      await resend.emails.send({
        from: getMailFrom(),
        to: r.gost.email,
        subject: "Rezervacija nije potvrđena",
        html: `
  <div style="font-family: Arial, sans-serif; background:#f4efe6; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:white; border:1px solid #eadfce;">
      <div style="background:#7f1d1d; color:white; padding:22px;">
        <h2 style="margin:0;">Rezervacija nije potvrđena</h2>
        <p style="margin:8px 0 0; color:#fee2e2;">
          Žao nam je, vašu rezervaciju trenutno nismo u mogućnosti potvrditi.
        </p>
      </div>

      <div style="padding:24px; color:#2e2923; line-height:1.55;">
        <p>Poštovani <strong>${r.gost.ime || "goste"} ${r.gost.prezime || ""}</strong>,</p>

        <p>
          Hvala vam na poslanom zahtjevu za rezervaciju. Nažalost, nakon provjere
          dostupnosti nismo u mogućnosti potvrditi ovu rezervaciju.
        </p>

        <div style="margin:22px 0; padding:18px; background:#fcfaf6; border:1px solid #eadfce;">
          <h3 style="margin:0 0 14px;">Detalji zahtjeva</h3>
          <p><strong>Objekt:</strong> ${r.jedinica.objekt.naziv}</p>
          <p><strong>Smještajna jedinica:</strong> ${r.jedinica.naziv}</p>
          <p><strong>Dolazak:</strong> ${formatDate(r.datumOd)}</p>
          <p><strong>Odlazak:</strong> ${formatDate(r.datumDo)}</p>
        </div>

        <div style="padding:16px; background:#fff6e2; border:1px solid #c79a57; color:#7a5a22;">
          Ako je kartica bila autorizirana, autorizacija se poništava i iznos se ne naplaćuje.
        </div>

        <p style="margin-top:22px;">
          Ispričavamo se zbog neugodnosti. Slobodno nam se javite za drugi termin
          ili drugu smještajnu jedinicu.
        </p>

        <p style="margin-top:28px;">
          Lijep pozdrav,<br/>
          <strong>Malinska Stay</strong>
        </p>
      </div>
    </div>
  </div>
`,
      });

      await prisma.emailLog.create({
        data: {
          rezervacijaId,
          to: r.gost.email,
          subject: "Rezervacija nije potvrđena",
          tip: "OTKAZIVANJE_REZERVACIJE",
          status: "POSLANO",
        },
      });
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin");
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    redirect(`/admin/rezervacije/${rezervacijaId}?odbijeno=1&updated=${Date.now()}`);
  }

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

    const placanje = await prisma.placanje.create({
      data: {
        rezervacijaId,
        tip,
        status: "CEKA_PLACANJE",
        iznos,
        valuta: "EUR",
        nacinPlacanja,
        napomena,
      },
    });

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
          placanjeId: placanje.id,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");

    const baseUrl = await getAppUrl();

    const potvrda = await fetch(`${baseUrl}/api/admin/placanja/potvrdi-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placanjeId: placanje.id,
      }),
    });

    if (!potvrda.ok) {
      throw new Error("Greška kod potvrde uplate.");
    }
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
      include: {
        gost: true,
        jedinica: {
          include: {
            objekt: true,
          },
        },
      },
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

    const subject =
      tip === "AKONTACIJA"
        ? "Zahtjev za uplatu akontacije"
        : tip === "RAZLIKA"
          ? "Zahtjev za uplatu razlike"
          : "Zahtjev za uplatu ostatka";

    const tipEmaila =
      tip === "AKONTACIJA"
        ? "ZAHTJEV_AKONTACIJA"
        : tip === "RAZLIKA"
          ? "ZAHTJEV_RAZLIKA"
          : "ZAHTJEV_OSTATAK";

    let mailStatus: "POSLANO" | "GRESKA" = "GRESKA";
    let mailGreska: string | null = null;

    if (!r.gost?.email) {
      mailGreska = "Gost nema upisanu email adresu. Mail nije stvarno poslan.";
    } else {
      try {
        await resend.emails.send({
          from: getMailFrom(),
          to: r.gost.email,
          subject,
          html: `
          <div style="font-family:Arial,sans-serif;background:#f4efe6;padding:24px;">
            <div style="max-width:640px;margin:0 auto;background:white;border:1px solid #eadfce;">
              <div style="background:#2e2923;color:white;padding:22px;">
                <h2 style="margin:0;">${subject}</h2>
                <p style="margin:8px 0 0;color:#eadfce;">
                  Rezervacija čeka uplatu.
                </p>
              </div>

              <div style="padding:24px;color:#2e2923;line-height:1.55;">
                <p>
                  Poštovani <strong>${r.gost.ime || "goste"} ${r.gost.prezime || ""
            }</strong>,
                </p>

                <p>
                  Vaša rezervacija je evidentirana. Molimo uplatu kako bismo
                  mogli potvrditi rezervaciju.
                </p>

                <div style="margin:22px 0;padding:18px;background:#fcfaf6;border:1px solid #eadfce;">
                  <h3 style="margin:0 0 14px;">Detalji rezervacije</h3>
                  <p><strong>Objekt:</strong> ${r.jedinica.objekt.naziv}</p>
                  <p><strong>Smještajna jedinica:</strong> ${r.jedinica.naziv}</p>
                  <p><strong>Dolazak:</strong> ${formatDate(r.datumOd)}</p>
                  <p><strong>Odlazak:</strong> ${formatDate(r.datumDo)}</p>
                  <p><strong>Iznos za uplatu:</strong> ${money(iznos)}</p>
                  ${rokUplateAkontacije
              ? `<p><strong>Rok uplate:</strong> ${formatDate(
                rokUplateAkontacije
              )}</p>`
              : ""
            }
                </div>

                <div style="padding:16px;background:#fff6e2;border:1px solid #c79a57;color:#7a5a22;">
                  Nakon što uplata bude vidljiva na našem računu, poslat ćemo
                  vam potvrdu rezervacije i račun.
                </div>

                <p style="margin-top:28px;">
                  Lijep pozdrav,<br/>
                  <strong>Malinska Stay</strong>
                </p>
              </div>
            </div>
          </div>
        `,
        });

        mailStatus = "POSLANO";
      } catch (error: any) {
        mailGreska =
          error?.message ||
          JSON.stringify(error) ||
          "Greška kod slanja emaila.";
      }
    }

    await prisma.emailLog.create({
      data: {
        rezervacijaId,
        to: r.gost?.email || "bez-emaila",
        subject,
        tip: tipEmaila,
        status: mailStatus,
        greska: mailGreska,
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
          mailStatus,
          mailGreska,
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
        gost: true,
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
        brojRacuna: {
          startsWith: `${prefix}-${godina}-`,
        },
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
          izdavatelj: {
            naziv: objekt.nazivZaRacun || objekt.naziv,
            oib: objekt.oibZaRacun || null,
            adresa: objekt.adresaZaRacun || null,
            mjesto: objekt.mjestoZaRacun || objekt.mjesto || null,
            iban: objekt.ibanZaRacun || null,
            email: objekt.emailZaRacun || null,
            telefon: objekt.telefonZaRacun || null,
          },
          gost: {
            ime: r.gost?.ime || null,
            prezime: r.gost?.prezime || null,
            email: r.gost?.email || null,
            telefon: r.gost?.telefon || null,
            adresa: r.gost?.adresa || null,
            grad: r.gost?.grad || null,
            drzava: r.gost?.drzava || null,
          },
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

    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();
    const adresa = String(formData.get("adresa") || "").trim();
    const grad = String(formData.get("grad") || "").trim();
    const drzava = String(formData.get("drzava") || "").trim();
    const napomena = String(formData.get("napomenaGosta") || "").trim();
    const oznake = formData.getAll("oznake").map(String).join(",");

    if (!gostId) {
      throw new Error("Gost nije pronađen.");
    }

    await prisma.gost.update({
      where: { id: gostId },
      data: {
        ime,
        prezime,
        email,
        telefon,
        adresa,
        grad,
        drzava,
        napomena,
        oznake,
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "GOST_NAPOMENA",
        opis: "Ažurirani podaci gosta.",
        noviPodaci: JSON.stringify({
          ime,
          prezime,
          email,
          telefon,
          adresa,
          grad,
          drzava,
          oznake,
          napomena,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/gosti");

    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function spremiTtlockPristup(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const sifraRaw = String(formData.get("sifra") || "").replace(/\D/g, "").slice(0, 4);
    const ulazVrijeme = String(formData.get("ulazVrijeme") || "16:00");
    const izlazVrijeme = String(formData.get("izlazVrijeme") || "10:00");

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      include: {
        gost: true,
        jedinica: {
          include: {
            ttlockBrave: true,
          },
        },
      },
    });

    if (!r) throw new Error("Rezervacija nije pronađena.");
    if (r.jedinica.ttlockBrave.length === 0) {
      throw new Error("Jedinica nema povezane TTLock brave.");
    }

    const sifra = sifraRaw || generirajSifruIzTelefona(r.gost?.telefon);

    const ulaz = parseTime(ulazVrijeme);
    const izlaz = parseTime(izlazVrijeme);

    const vrijediOd = setTime(r.datumOd, ulaz.hour, ulaz.minute);
    const vrijediDo = setTime(r.datumDo, izlaz.hour, izlaz.minute);

    for (const veza of r.jedinica.ttlockBrave) {
      await prisma.rezervacijaTtlockSifra.upsert({
        where: {
          rezervacijaId_bravaId: {
            rezervacijaId: r.id,
            bravaId: veza.bravaId,
          },
        },
        update: {
          sifra,
          vrijediOd,
          vrijediDo,
          status: "CEKA",
          greska: null,
        },
        create: {
          rezervacijaId: r.id,
          bravaId: veza.bravaId,
          sifra,
          vrijediOd,
          vrijediDo,
          status: "CEKA",
        },
      });
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function posaljiTtlockNaBrave(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");

    const sifre = await prisma.rezervacijaTtlockSifra.findMany({
      where: { rezervacijaId },
      include: {
        brava: true,
        rezervacija: {
          include: {
            gost: true,
            jedinica: {
              include: {
                objekt: true,
              },
            },
          },
        },
      },
    });

    for (const s of sifre) {
      try {
        const response = await dodajTtlockSifru({
          lockId: s.brava.lockId,
          sifra: s.sifra,
          naziv: `${s.rezervacija.jedinica.naziv} ${s.rezervacija.gost?.ime || "Gost"}`,
          vrijediOd: s.vrijediOd,
          vrijediDo: s.vrijediDo,
        });

        await prisma.rezervacijaTtlockSifra.update({
          where: { id: s.id },
          data: {
            status: "POSLANO",
            ttlockKeyboardPwdId: response.keyboardPwdId
              ? String(response.keyboardPwdId)
              : null,
            greska: null,
          },
        });
      } catch (error: any) {
        await prisma.rezervacijaTtlockSifra.update({
          where: { id: s.id },
          data: {
            status: "GRESKA",
            greska: error?.message || "Greška kod slanja na TTLock.",
          },
        });
      }
    }

    revalidatePath(`/admin/rezervacije/${rezervacijaId}`);
    redirect(`/admin/rezervacije/${rezervacijaId}`);
  }

  async function obrisiAdminRezervaciju(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const potvrda = String(formData.get("potvrdaBrisanja") || "")
      .trim()
      .toUpperCase();

    if (potvrda !== "OBRIŠI") {
      throw new Error("Za brisanje morate upisati OBRIŠI.");
    }

    const r = await prisma.rezervacija.findUnique({
      where: { id: rezervacijaId },
      select: {
        id: true,
        izvor: true,
        status: true,
      },
    });

    if (!r) {
      throw new Error("Rezervacija nije pronađena.");
    }

    await prisma.rezervacija.update({
      where: { id: rezervacijaId },
      data: {
        statusPrijeBrisanja: r.status,
        status: "OBRISANO",
        obrisanoAt: new Date(),
        obrisaoKorisnik: "Admin",
      },
    });

    await prisma.rezervacijaPromjena.create({
      data: {
        rezervacijaId,
        tip: "BRISANJE_REZERVACIJE",
        opis: "Rezervacija je označena kao obrisana.",
        stariPodaci: JSON.stringify({
          status: r.status,
        }),
        noviPodaci: JSON.stringify({
          status: "OTKAZANO",
          oznacenoKaoObrisano: true,
        }),
        korisnikIme: "Admin",
      },
    });

    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/naplata");
    revalidatePath("/admin/monitor");
    revalidatePath("/admin/gosti");

    redirect("/admin/rezervacije");
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin/rezervacije"
                className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
              >
                ← Sve rezervacije
              </Link>

              <h1 className="mt-4 text-4xl font-black">
                Admin detalj rezervacije
              </h1>

              <p className="mt-2 text-[#6f665a]">
                {rezervacija.jedinica.objekt.naziv} /{" "}
                {rezervacija.jedinica.naziv}
              </p>

              <p className="mt-1 text-xs text-[#9b7a4c]">
                ID: {rezervacija.id}
              </p>
            </div>

            <div className="text-right">
              <div
                className="inline-block border px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor:
                    rezervacija.status === "OTKAZANO"
                      ? "#fee2e2"
                      : "#fff6e2",
                  borderColor:
                    rezervacija.status === "OTKAZANO"
                      ? UI_COLORS.zauzetoBorder
                      : UI_COLORS.gold,
                  color:
                    rezervacija.status === "OTKAZANO"
                      ? UI_COLORS.zauzetoBorder
                      : "#7a5a22",
                }}
              >
                {rezervacija.status}
              </div>

              <div className="mt-2 text-xs font-bold text-[#6f665a]">
                Izvor: {rezervacija.izvor}
              </div>
            </div>
          </div>

          {(rezervacija.izvor === "BOOKING" || rezervacija.izvor === "WEB") && (
            <div className="mt-5 border border-[#ead7b6] bg-[#fff9ef] p-4 text-sm font-bold text-[#7a5a22]">
              UPOZORENJE: ova rezervacija je kreirana putem{" "}
              {rezervacija.izvor}. Kod promjene termina, cijene, otkazivanja ili
              povrata treba dodatno provjeriti uplatu i vanjski sustav.
            </div>
          )}

          {rezervacija.status === "CEKA_AKONTACIJU" && (
            <div className="mt-5 border-2 border-amber-300 bg-amber-50 p-5 text-amber-800">
              <h2 className="text-2xl font-black">
                ⏳ Čeka uplatu akontacije
              </h2>

              <p className="mt-2 text-sm font-bold">
                Gostu je poslan link za plaćanje. Rezervacija još nije potvrđena.
              </p>
            </div>
          )}

          {rezervacija.status === "CEKA_POTVRDU" && (
            <div className="mt-5 border-2 border-blue-300 bg-blue-50 p-5 text-blue-800">
              <h2 className="text-2xl font-black">
                🔎 Uplata zaprimljena — čeka provjeru
              </h2>

              <p className="mt-2 text-sm font-bold">
                Potrebno je provjeriti uplatu i ručno potvrditi rezervaciju.
              </p>
            </div>
          )}

          {["POTVRDENO", "PLACENO", "CEKA_OSTATAK"].includes(rezervacija.status) && (
            <div className="mt-5 border-2 border-green-300 bg-green-50 p-5 text-green-800">
              <h2 className="text-2xl font-black">
                ✅ Rezervacija potvrđena
              </h2>

              <p className="mt-2 text-sm font-bold">
                Rezervacija je potvrđena.
              </p>
            </div>
          )}
        </div>



        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <Stat title="Ukupno" value={money(ukupno)} color="text-[#2e2923]" />
          <Stat title="Plaćeno" value={money(placeno)} color="text-[#2e2923]" />
          <Stat title="Ostatak" value={money(ostatak)} color="text-[#9b6b12]" />
          <Stat title="Popust" value={money(popust)} color="text-[#2e2923]" />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <Card title="Gost">
            {gostUpozorenje && (
              <div className="mb-4 border border-red-300 bg-red-50 p-3 text-sm font-black text-red-700">
                ⚠ Pažnja — gost ima oznaku: {gostOznake.join(", ")}
              </div>
            )}

            <Detail
              label="Ime"
              value={`${rezervacija.gost?.ime || "Gost"} ${rezervacija.gost?.prezime || ""
                }`}
            />
            <Detail label="Email" value={rezervacija.gost?.email || "-"} />
            <Detail label="Telefon" value={rezervacija.gost?.telefon || "-"} />
            <Detail label="Adresa" value={rezervacija.gost?.adresa || "-"} />
            <Detail label="Grad / mjesto" value={rezervacija.gost?.grad || "-"} />
            <Detail label="Država" value={rezervacija.gost?.drzava || "-"} />

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
                          ? "#fee2e2"
                          : "#fff6e2",
                      borderColor:
                        oznaka === "NEUREDAN" ||
                          oznaka === "PROBLEMATICAN" ||
                          oznaka === "KASNI_S_PLACANJEM"
                          ? UI_COLORS.zauzetoBorder
                          : UI_COLORS.gold,
                      color:
                        oznaka === "NEUREDAN" ||
                          oznaka === "PROBLEMATICAN" ||
                          oznaka === "KASNI_S_PLACANJEM"
                          ? UI_COLORS.zauzetoBorder
                          : "#7a5a22",
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
                className="mt-5 border border-[#e2d8c8] bg-[#fcfaf6] p-4"
              >
                <input
                  type="hidden"
                  name="rezervacijaId"
                  value={rezervacija.id}
                />
                <input type="hidden" name="gostId" value={rezervacija.gost.id} />

                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Ime">
                    <input
                      name="ime"
                      defaultValue={rezervacija.gost.ime || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Prezime">
                    <input
                      name="prezime"
                      defaultValue={rezervacija.gost.prezime || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      defaultValue={rezervacija.gost.email || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Telefon">
                    <input
                      name="telefon"
                      defaultValue={rezervacija.gost.telefon || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Adresa">
                    <input
                      name="adresa"
                      defaultValue={rezervacija.gost.adresa || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Grad / mjesto">
                    <input
                      name="grad"
                      defaultValue={rezervacija.gost.grad || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>

                  <Field label="Država">
                    <input
                      name="drzava"
                      defaultValue={rezervacija.gost.drzava || ""}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    />
                  </Field>
                </div>

                <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#7a5a22]">
                  Oznake gosta
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {OZNAKE_GOSTA.map((oznaka) => (
                    <label
                      key={oznaka}
                      className="flex cursor-pointer items-center gap-2 border border-[#e2d8c8] bg-white px-3 py-2 text-xs font-bold text-[#2e2923]"
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
                    className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    placeholder="Npr. super gost, uredan, kasni s uplatom, traži raniji ulazak..."
                  />
                </Field>

                <button
                  className="mt-3 cursor-pointer border border-[#caa870] bg-[#c79a57] px-4 py-3 text-sm font-black text-white transition hover:brightness-95"
                >
                  Spremi podatke o gostu
                </button>
              </form>
            )}

            <div className="mt-4">
              <Link
                href={`/admin/rezervacije/${rezervacija.id}/promjena-termina`}
                className="block cursor-pointer border border-[#caa870] bg-[#fff6e2] px-4 py-3 text-center text-sm font-black text-[#7a5a22] transition hover:bg-[#c79a57] hover:text-white"
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

          <Card title="TTLock pristup">
            {rezervacija.jedinica.ttlockBrave.length === 0 ? (
              <div className="border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
                Ova jedinica još nema povezane TTLock brave.
              </div>
            ) : (
              <>
                <form action={spremiTtlockPristup} className="space-y-3">
                  <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                  <Field label="Šifra gosta">
                    <input
                      name="sifra"
                      maxLength={4}
                      defaultValue={ttlockSifra}
                      className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-center text-3xl font-black tracking-[0.25em] text-[#2e2923] outline-none"
                    />
                  </Field>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={`Ulaz ${formatDate(rezervacija.datumOd)}`}>
                      <input
                        name="ulazVrijeme"
                        type="time"
                        defaultValue={formatTime(ttlockUlaz)}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>

                    <Field label={`Izlaz ${formatDate(rezervacija.datumDo)}`}>
                      <input
                        name="izlazVrijeme"
                        type="time"
                        defaultValue={formatTime(ttlockIzlaz)}
                        className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                      />
                    </Field>
                  </div>

                  <button className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-4 py-3 text-sm font-black text-white transition hover:brightness-95">
                    Spremi šifru i vrijeme
                  </button>
                </form>

                <div className="mt-4 border border-[#e2d8c8] bg-[#fcfaf6] p-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
                    Brave
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {rezervacija.jedinica.ttlockBrave.map((veza) => (
                      <span
                        key={veza.id}
                        className="border border-[#e2d8c8] bg-white px-3 py-2 text-xs font-black text-[#2e2923]"
                      >
                        {veza.brava.naziv}
                      </span>
                    ))}
                  </div>
                </div>

                {rezervacija.ttlockSifre.length > 0 && (
                  <form action={posaljiTtlockNaBrave} className="mt-4">
                    <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                    <button className="w-full cursor-pointer border border-green-700 bg-green-700 px-4 py-3 text-sm font-black text-white hover:brightness-95">
                      Pošalji šifru na TTLock brave
                    </button>
                  </form>
                )}

                {rezervacija.ttlockSifre.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {rezervacija.ttlockSifre.map((s) => (
                      <div
                        key={s.id}
                        className="border border-[#e2d8c8] bg-white p-3 text-xs"
                      >
                        <div className="font-black">{s.brava.naziv}</div>
                        <div className="mt-1 text-[#6f665a]">
                          {formatDateTime(s.vrijediOd)} - {formatDateTime(s.vrijediDo)}
                        </div>
                        <div className="mt-1 font-black text-[#9b6b12]">
                          Status: {s.status}
                        </div>
                        {s.greska && (
                          <div className="mt-2 bg-red-50 p-2 text-red-700">
                            {s.greska}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
          <section className="mb-6 border-2 border-red-400 bg-red-50 p-5 text-red-800 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
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
                  className="w-full border border-red-300 bg-white px-3 py-2 text-red-900 outline-none"
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
                  className="w-full border border-red-300 bg-white px-3 py-2 font-black text-red-900 outline-none"
                />
              </label>

              <button className="cursor-pointer border border-red-700 bg-red-700 px-5 py-3 text-sm font-black text-white hover:brightness-95">
                Potvrdi storno rezervacije
              </button>
            </form>
          </section>
        )}

        {rezervacija.napomena?.trim() && (
          <section className="mb-6 border-2 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-800 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
            <div className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-red-700">
              ⚠ Napomena gosta
            </div>

            <div className="mt-2 whitespace-pre-wrap">
              {rezervacija.napomena}
            </div>
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
                    className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    required
                  />
                </Field>

                <Field label="Tip uplate">
                  <select
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                    className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
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
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
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
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                  placeholder="Npr. uplata vidljiva na računu, dogovor s gostom..."
                />
              </Field>

              <button className="cursor-pointer border border-[#22c55e] bg-[#dcfce7] px-4 py-3 text-sm font-black text-[#166534] transition hover:brightness-95">
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
                    className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                    required
                  />
                </Field>

                <Field label="Vrsta zahtjeva">
                  <select
                    name="tip"
                    defaultValue={placeno > 0 ? "OSTATAK" : "AKONTACIJA"}
                    className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
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
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                />
              </Field>

              <Field label="Napomena za zahtjev">
                <textarea
                  name="napomena"
                  rows={3}
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                  placeholder="Npr. molimo uplatu akontacije za potvrdu rezervacije..."
                />
              </Field>

              <button className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-4 py-3 text-sm font-black text-white transition hover:brightness-95">
                Kreiraj zahtjev za uplatu
              </button>

              <p className="text-xs text-[#6f665a]">
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
                    className="border border-[#e2d8c8] bg-[#fcfaf6] p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black text-[#2e2923]">
                          {p.tip} · {p.status}
                        </div>
                        <div className="text-xs text-[#6f665a]">
                          {formatDateTime(p.createdAt)}
                        </div>
                      </div>

                      <div className="text-right font-black text-[#166534]">
                        {money(p.iznos)}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-[#6f665a]">
                      Način: {p.nacinPlacanja || p.provider || "-"}
                    </div>

                    {p.napomena && (
                      <div className="mt-2 border border-[#ead7b6] bg-[#fff9ef] p-2 text-xs text-[#6f665a]">
                        {p.napomena}
                      </div>
                    )}

                    {p.provider === "STRIPE" &&
                      p.status !== "PLACENO" &&
                      rezervacija.status === "CEKA_POTVRDU" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/api/admin/placanja/potvrdi-link?placanjeId=${p.id}`}
                            className="inline-block cursor-pointer border border-green-700 bg-green-700 px-4 py-2 text-xs font-black text-white hover:brightness-95"
                          >
                            ✅ Provjeri uplatu i potvrdi
                          </Link>

                          <form action={odbijRezervaciju}>
                            <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

                            <button className="cursor-pointer border border-red-700 bg-red-700 px-4 py-2 text-xs font-black text-white hover:brightness-95">
                              ❌ Odbij rezervaciju
                            </button>
                          </form>
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
              className="mb-4 border border-[#e2d8c8] bg-[#fcfaf6] p-3"
            >
              <input type="hidden" name="rezervacijaId" value={rezervacija.id} />

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  name="iznos"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={ukupno.toFixed(2)}
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
                  required
                />

                <button className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-4 py-2 text-sm font-black text-white transition hover:brightness-95">
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
                    className="border border-[#e2d8c8] bg-[#fcfaf6] p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black text-[#2e2923]">
                          {racun.brojRacuna}
                        </div>
                        <div className="text-xs text-[#6f665a]">
                          {formatDateTime(racun.createdAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-black text-[#2e2923]">
                          {money(racun.iznos)}
                        </div>
                        <div className="text-xs text-[#6f665a]">
                          {racun.poslanGostu ? "Poslan gostu" : "Nije poslan"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {racun.pdfUrl ? (
                        <Link
                          href={racun.pdfUrl}
                          target="_blank"
                          className="cursor-pointer border border-[#e2d8c8] bg-white px-3 py-2 text-xs font-black text-[#2e2923] hover:bg-[#f8f3ea]"
                        >
                          Otvori PDF
                        </Link>
                      ) : (
                        <span className="border border-[#e2d8c8] bg-white px-3 py-2 text-xs font-black text-[#6f665a]">
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

                        <button className="cursor-pointer border border-[#caa870] bg-[#fff6e2] px-3 py-2 text-xs font-black text-[#7a5a22] hover:bg-[#c79a57] hover:text-white">
                          Označi / pošalji račun na mail
                        </button>
                      </form>

                      <form
                        action={async () => {
                          "use server";

                          await fetch(
                            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/admin/racuni/posalji`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                racunId: racun.id,
                              }),
                            }
                          );

                          revalidatePath(`/admin/rezervacije/${rezervacija.id}`);
                          redirect(`/admin/rezervacije/${rezervacija.id}`);
                        }}
                      >
                        <button className="cursor-pointer border border-[#caa870] bg-white px-3 py-2 text-xs font-black text-[#7a5a22] hover:bg-[#fff6e2]">
                          Ponovno pošalji račun
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
                    className="border border-[#e2d8c8] bg-[#fcfaf6] p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-black text-[#2e2923]">
                          {e.subject}
                        </div>
                        <div className="text-xs text-[#6f665a]">
                          {e.to} · {e.tip}
                        </div>
                      </div>

                      <div className="text-xs font-black text-[#9b6b12]">
                        {e.status}
                      </div>
                    </div>

                    {e.greska && (
                      <div className="mt-2 bg-red-50 p-2 text-xs text-red-700">
                        {e.greska}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-[#9b7a4c]">
                      {formatDateTime(e.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Povijest promjena">
            {rezervacija.status !== "OBRISANO" ? (
              <div className="mb-5 border-2 border-red-300 bg-red-50 p-4 text-red-800">
                <div className="text-xs font-black uppercase tracking-[0.16em]">
                  BRISANJE / ARHIVIRANJE  REZERVACIJE
                </div>

                <p className="mt-2 text-sm">
                  Ova rezervacija će biti označena kao obrisana, termin će se osloboditi,
                  a zapis ostaje u povijesti promjena.
                </p>

                <form
                  action={obrisiAdminRezervaciju}
                  className="mt-4 space-y-3"
                >
                  <input
                    type="hidden"
                    name="rezervacijaId"
                    value={rezervacija.id}
                  />

                  <label className="block">
                    <div className="mb-1 text-xs font-black uppercase tracking-[0.14em]">
                      Za potvrdu upiši: OBRIŠI
                    </div>

                    <input
                      name="potvrdaBrisanja"
                      required
                      placeholder="OBRIŠI"
                      className="w-full border border-red-300 bg-white px-3 py-2 font-black text-red-900 outline-none"
                    />
                  </label>

                  <button className="cursor-pointer border border-red-700 bg-red-700 px-4 py-3 text-sm font-black text-white hover:brightness-95">
                    Obriši rezervaciju
                  </button>
                </form>
              </div>
            ) : null}

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
                      className="border border-[#e2d8c8] bg-[#fcfaf6] p-3"
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <div className="font-black text-[#2e2923]">
                              {p.tip}
                            </div>

                            <div className="text-xs text-[#6f665a]">
                              {p.opis || "-"}
                            </div>

                            <div className="mt-1 text-xs text-[#9b6b12]">
                              Tko: {p.korisnikIme || "Nepoznato"}
                            </div>
                          </div>

                          <div className="text-right text-xs text-[#6f665a]">
                            {formatDateTime(p.createdAt)}
                            <div className="mt-1 font-black text-[#9b6b12]">
                              Klikni za detalje
                            </div>
                          </div>
                        </div>
                      </summary>

                      <div className="mt-4 border-t border-[#e2d8c8] pt-4">
                        {p.razlog && (
                          <div className="mb-4 border border-[#ead7b6] bg-[#fff9ef] p-3 text-sm text-[#7a5a22]">
                            <div className="text-xs font-black uppercase tracking-[0.14em]">
                              Razlog promjene
                            </div>
                            <div className="mt-1">{p.razlog}</div>
                          </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="border border-red-200 bg-red-50 p-3">
                            <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-red-700">
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
                              <p className="text-sm text-[#6f665a]">
                                Nema detaljnih starih podataka.
                              </p>
                            )}
                          </div>

                          <div className="border border-green-200 bg-green-50 p-3">
                            <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-green-700">
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
                              <p className="text-sm text-[#6f665a]">
                                Nema detaljnih novih podataka.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-[#9b7a4c]">
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
    <div className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
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
    <section className="border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
      <h2 className="mb-4 text-xl font-black text-[#2e2923]">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 border border-[#e2d8c8] bg-[#fcfaf6] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-[#2e2923]">
        {value || "-"}
      </div>
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

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[#6f665a]">{text}</p>;
}

function ChangeRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#e2d8c8] pb-1">
      <span className="text-[#6f665a]">{label}</span>
      <span className="text-right font-black text-[#2e2923]">
        {value === null || value === undefined || value === "" ? "-" : value}
      </span>
    </div>
  );
}