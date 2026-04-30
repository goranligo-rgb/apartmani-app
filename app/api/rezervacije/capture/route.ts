import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function runCapture() {
  const now = new Date();

  const placanja = await prisma.placanje.findMany({
    where: {
      provider: "STRIPE",
      paymentIntentId: {
        not: null,
      },
      placenoAt: null,
      expiresAt: {
        lte: now,
      },
      status: {
        not: "PLACENO" as any,
      },
    },
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
    take: 20,
    orderBy: {
      expiresAt: "asc",
    },
  });

  const results = [];

  for (const placanje of placanja) {
    try {
      if (!placanje.paymentIntentId) continue;

      const paymentIntent = await stripe.paymentIntents.retrieve(
        placanje.paymentIntentId
      );

      if (paymentIntent.status === "requires_capture") {
        await stripe.paymentIntents.capture(placanje.paymentIntentId);
      }

      const potvrdiRes = await fetch(`${getAppUrl()}/api/rezervacije/potvrdi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placanjeId: placanje.id,
        }),
      });

      if (!potvrdiRes.ok) {
        const text = await potvrdiRes.text();

        await prisma.placanje.update({
          where: { id: placanje.id },
          data: {
            napomena: `Stripe capture je prošao, ali potvrda/račun/mail nisu prošli: ${text}`,
          },
        });

        results.push({
          placanjeId: placanje.id,
          ok: false,
          error: text,
        });

        continue;
      }

      await prisma.rezervacijaPromjena.create({
        data: {
          rezervacijaId: placanje.rezervacijaId,
          tip: "STRIPE_CAPTURE",
          opis:
            "Stripe autorizacija je naplaćena. Rezervacija je potvrđena, račun generiran i mail poslan.",
          noviPodaci: JSON.stringify({
            placanjeId: placanje.id,
            paymentIntentId: placanje.paymentIntentId,
          }),
          korisnikIme: "Stripe cron",
        },
      });

      results.push({
        placanjeId: placanje.id,
        ok: true,
      });
    } catch (error: any) {
      await prisma.placanje.update({
        where: { id: placanje.id },
        data: {
          napomena: `Greška kod Stripe capture: ${
            error?.message || String(error)
          }`,
        },
      });

      results.push({
        placanjeId: placanje.id,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: true,
    count: placanja.length,
    results,
  };
}

export async function GET() {
  const result = await runCapture();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await runCapture();
  return NextResponse.json(result);
}