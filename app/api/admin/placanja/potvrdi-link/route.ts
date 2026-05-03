import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateRacunPdf } from "@/lib/generateRacunPdf";
import fs from "fs";
import path from "path";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";

const resend = new Resend(process.env.RESEND_API_KEY);

function sanitizePrefix(value?: string | null) {
    const clean = String(value || "RAC")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    return clean || "RAC";
}

async function getNextBrojRacuna(tx: any, prefixRaw?: string | null) {
    const prefix = sanitizePrefix(prefixRaw);
    const godina = new Date().getFullYear();

    const racuni = await tx.racun.findMany({
        where: {
            brojRacuna: {
                startsWith: `${prefix}-`,
            },
        },
        select: {
            brojRacuna: true,
        },
    });

    let najveciBroj = 0;

    for (const racun of racuni) {
        const match = String(racun.brojRacuna).match(
            new RegExp(`^${prefix}-(\\d+)-${godina}$`)
        );

        if (match) {
            const broj = Number(match[1]);
            if (!Number.isNaN(broj) && broj > najveciBroj) {
                najveciBroj = broj;
            }
        }
    }

    return `${prefix}-${String(najveciBroj + 1).padStart(3, "0")}-${godina}`;
}

function getCcEmails(objekt: any) {
    const raw = String(objekt.ccEmailZaRacun || "").trim();

    const cc = raw
        ? raw
            .split(",")
            .map((email) => email.trim())
            .filter(Boolean)
        : [];

    const unique = cc.filter((email, index, arr) => arr.indexOf(email) === index);

    return unique.length > 0 ? unique : undefined;
}

async function getStripePaymentIntentId(placanje: any) {
    if (placanje.paymentIntentId) {
        return placanje.paymentIntentId;
    }

    if (!placanje.providerId) {
        return null;
    }

    const session = await stripe.checkout.sessions.retrieve(placanje.providerId);
    const pi = session.payment_intent;

    if (!pi) return null;

    return typeof pi === "string" ? pi : pi.id;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const placanjeId = searchParams.get("placanjeId");

        if (!placanjeId) {
            return NextResponse.json(
                { error: "Nedostaje placanjeId" },
                { status: 400 }
            );
        }

        const placanje = await prisma.placanje.findUnique({
            where: { id: placanjeId },
            include: {
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

        if (!placanje) {
            return NextResponse.json(
                { error: "Plaćanje nije pronađeno." },
                { status: 404 }
            );
        }

        if (placanje.status === "PLACENO") {
            return NextResponse.redirect(
                new URL(`/admin/rezervacije/${placanje.rezervacijaId}`, req.url),
                303
            );
        }

        let paymentIntentId: string | null = null;

        if (placanje.provider === "STRIPE") {
            paymentIntentId = await getStripePaymentIntentId(placanje);

            if (!paymentIntentId) {
                return NextResponse.json(
                    {
                        error:
                            "Stripe autorizacija nije pronađena. Gost možda nije dovršio kartično plaćanje.",
                    },
                    { status: 400 }
                );
            }

            const paymentIntent = await stripe.paymentIntents.retrieve(
                paymentIntentId
            );

            if (paymentIntent.status === "requires_capture") {
                await stripe.paymentIntents.capture(paymentIntentId);
            } else if (paymentIntent.status === "succeeded") {
                // već naplaćeno, samo nastavljamo evidenciju u sustavu
            } else {
                return NextResponse.json(
                    {
                        error: `Kartica nije spremna za naplatu. Stripe status: ${paymentIntent.status}`,
                    },
                    { status: 400 }
                );
            }
        }

        const ukupnoRezervacije = Number(
            placanje.rezervacija.dogovoreniIznos ||
            placanje.rezervacija.iznosUkupno ||
            placanje.rezervacija.iznosOsnovni ||
            0
        );

        const novoPlaceno =
            Number(placanje.rezervacija.iznosPlaceno || 0) +
            Number(placanje.iznos || 0);

        const noviOstatak = Math.max(ukupnoRezervacije - novoPlaceno, 0);

        const noviStatus =
            noviOstatak <= 0
                ? "PLACENO"
                : placanje.tip === "POTVRDA_REZERVACIJE"
                    ? "POTVRDENO"
                    : "CEKA_OSTATAK";

        const objekt = placanje.rezervacija.jedinica.objekt;

        let brojRacuna = "";
        let pdfUrl: string | null = null;

        await prisma.$transaction(async (tx) => {
            brojRacuna = await getNextBrojRacuna(
                tx,
                objekt.prefixRacuna || objekt.naziv
            );

            await tx.placanje.update({
                where: { id: placanjeId },
                data: {
                    status: "PLACENO",
                    placenoAt: new Date(),
                    paymentIntentId: paymentIntentId || placanje.paymentIntentId,
                    napomena: "Stripe kartica je naplaćena. Rezervacija je potvrđena i račun je poslan gostu.",
                },
            });

            await tx.rezervacija.update({
                where: { id: placanje.rezervacijaId },
                data: {
                    status: noviStatus as any,
                    iznosPlaceno: novoPlaceno,
                    iznosOstatka: noviOstatak,
                    placenoKarticom: placanje.provider === "STRIPE" ? true : undefined,
                },
            });

            const noviRacun = await tx.racun.create({
                data: {
                    rezervacijaId: placanje.rezervacijaId,
                    placanjeId: placanje.id,
                    objektId: objekt.id,

                    brojRacuna,
                    iznos: placanje.iznos,
                    valuta: placanje.valuta,

                    nazivIzdavatelja: objekt.nazivZaRacun || objekt.naziv,
                    oibIzdavatelja: objekt.oibZaRacun,
                    adresaIzdavatelja: objekt.adresaZaRacun,
                    mjestoIzdavatelja: objekt.mjestoZaRacun || objekt.mjesto,
                    ibanIzdavatelja: objekt.ibanZaRacun,
                    emailIzdavatelja: objekt.emailZaRacun,
                    telefonIzdavatelja: objekt.telefonZaRacun,
                },
            });

            pdfUrl = await generateRacunPdf({
                ...noviRacun,
                rezervacija: placanje.rezervacija,
                gost: placanje.rezervacija.gost,
                jedinica: placanje.rezervacija.jedinica,
                objekt: placanje.rezervacija.jedinica.objekt,
            });

            await tx.racun.update({
                where: { id: noviRacun.id },
                data: {
                    pdfUrl,
                },
            });

            if (pdfUrl) {
                const cleanPdfUrl = pdfUrl.startsWith("/") ? pdfUrl.slice(1) : pdfUrl;
                const filePath = path.join(process.cwd(), "public", cleanPdfUrl);
                const fileBuffer = fs.readFileSync(filePath);

                const email =
                    placanje.rezervacija.gost?.email || "goran.ligo@gmail.com";
                const ccEmails = getCcEmails(objekt);

                const gostIme = placanje.rezervacija.gost?.ime || "Poštovani gost";
                const nazivJedinice = placanje.rezervacija.jedinica.naziv;
                const nazivObjekta = placanje.rezervacija.jedinica.objekt.naziv;

                const datumOd = new Date(
                    placanje.rezervacija.datumOd
                ).toLocaleDateString("hr-HR");

                const datumDo = new Date(
                    placanje.rezervacija.datumDo
                ).toLocaleDateString("hr-HR");

                const mailResult = await resend.emails.send({
                    from: "Malinska-stay <rezervacije@malinska-stay.hr>",
                    to: email,
                    cc: ccEmails,
                    subject:
                        noviStatus === "PLACENO"
                            ? "Rezervacija i plaćanje potvrđeni"
                            : "Vaša rezervacija je potvrđena",
                    html: `
    <h2>${noviStatus === "PLACENO"
                            ? "Rezervacija i plaćanje potvrđeni"
                            : "Rezervacija potvrđena"
                        }</h2>

    <p>Poštovani ${gostIme},</p>

    <p>
      ${noviStatus === "PLACENO"
                            ? "Vaše plaćanje je uspješno zaprimljeno i rezervacija je potvrđena."
                            : "Vaša rezervacija je uspješno potvrđena."
                        }
    </p>

    <p>
      <strong>Objekt:</strong> ${nazivObjekta}<br/>
      <strong>Smještajna jedinica:</strong> ${nazivJedinice}<br/>
      <strong>Dolazak:</strong> ${datumOd}<br/>
      <strong>Odlazak:</strong> ${datumDo}
    </p>

    <p>U privitku vam šaljemo račun.</p>

    <p>Veselimo se vašem dolasku!</p>

    <br/>
    <p>Lijep pozdrav,<br/>Malinska Stay</p>
  `,
                    attachments: [
                        {
                            filename: `${brojRacuna}.pdf`,
                            content: fileBuffer,
                        },
                    ],
                });

                if (mailResult.error) {
                    await tx.emailLog.create({
                        data: {
                            rezervacijaId: placanje.rezervacijaId,
                            to: email,
                            subject: `Račun ${brojRacuna} nije poslan`,
                            tip:
                                placanje.tip === "POTVRDA_REZERVACIJE"
                                    ? "POTVRDA_REZERVACIJE"
                                    : "HVALA_NA_PLACANJU",
                            status: "GRESKA",
                            greska: mailResult.error.message || "Resend greška kod slanja maila.",
                        },
                    });
                } else {
                    await tx.emailLog.create({
                        data: {
                            rezervacijaId: placanje.rezervacijaId,
                            to: email,
                            subject: `Račun ${brojRacuna} poslan`,
                            tip:
                                placanje.tip === "POTVRDA_REZERVACIJE"
                                    ? "POTVRDA_REZERVACIJE"
                                    : "HVALA_NA_PLACANJU",
                            status: "POSLANO",
                        },
                    });
                }

                await tx.rezervacijaPromjena.create({
                    data: {
                        rezervacijaId: placanje.rezervacijaId,
                        tip: "POTVRDA_NAPLATE",
                        opis:
                            placanje.provider === "STRIPE"
                                ? "Admin je potvrdio rezervaciju i naplatio Stripe autorizaciju."
                                : "Admin je potvrdio plaćanje.",
                        noviPodaci: JSON.stringify({
                            placanjeId: placanje.id,
                            iznos: placanje.iznos,
                            valuta: placanje.valuta,
                            provider: placanje.provider,
                            paymentIntentId,
                            statusRezervacije: noviStatus,
                            brojRacuna,
                            pdfUrl,
                        }),
                        korisnikIme: "Admin",
                    },
                });
            }
        });

        revalidatePath(`/admin/rezervacije/${placanje.rezervacijaId}`);
        revalidatePath("/admin");
        revalidatePath("/admin/rezervacije");
        revalidatePath("/admin/rezervacije/naplata");
        revalidatePath("/admin/monitor");

        return NextResponse.redirect(
            new URL(
                `/admin/rezervacije/${placanje.rezervacijaId}?potvrdeno=1&updated=${Date.now()}`,
                req.url
            ),
            303
        );

    } catch (err) {
        console.error(err);

        return NextResponse.json(
            { error: "Greška kod potvrde, naplate, računa ili slanja maila." },
            { status: 500 }
        );
    }
}