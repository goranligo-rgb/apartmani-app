import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { zaprimiAutoriziranuRezervaciju } from "@/lib/zaprimiRezervaciju";

// Webhook treba Node runtime — verifikacija potpisa koristi Node crypto.
export const runtime = "nodejs";
// Nikad ne keširati — svaki POST je nov Stripe event.
export const dynamic = "force-dynamic";

// Poveži Stripe Checkout sesiju s našim Placanjem.
//   Primarno: session.metadata.placanjeId (create-payment ga uvijek upisuje
//             u metadata, i to već u verziji koja je danas u produkciji).
//   Fallback: Placanje gdje je providerId === session.id (create-payment
//             upisuje providerId = Stripe Checkout Session ID).
async function nadiPlacanjeId(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const izMetadata = session.metadata?.placanjeId;
  if (izMetadata) return izMetadata;

  const placanje = await prisma.placanje.findFirst({
    where: { providerId: session.id },
    select: { id: true },
  });

  return placanje?.id ?? null;
}

// checkout.session.expired — Checkout sesija istekla bez plaćanja.
// Očisti siroče: ako je rezervacija JOŠ UPIT, otkaži nju i plaćanje.
// Ako je već CEKA_POTVRDU ili dalje — gost je ipak platio, NE diramo ništa.
async function ocistiIstekluRezervaciju(placanjeId: string) {
  const placanje = await prisma.placanje.findUnique({
    where: { id: placanjeId },
    select: { id: true, rezervacijaId: true },
  });

  if (!placanje) return;

  // Uvjetni update — otkazujemo SAMO ako je rezervacija još UPIT.
  const { count } = await prisma.rezervacija.updateMany({
    where: { id: placanje.rezervacijaId, status: "UPIT" },
    data: { status: "OTKAZANO" },
  });

  // count === 0 -> rezervacija nije UPIT (gost je platio na vrijeme).
  if (count === 0) return;

  await prisma.placanje.update({
    where: { id: placanje.id },
    data: {
      status: "OTKAZANO",
      napomena:
        "Stripe Checkout sesija istekla bez plaćanja — rezervacija automatski otkazana.",
    },
  });

  await prisma.rezervacijaPromjena.create({
    data: {
      rezervacijaId: placanje.rezervacijaId,
      tip: "OTKAZIVANJE_REZERVACIJE",
      opis:
        "Checkout sesija je istekla bez plaćanja. Rezervacija je automatski otkazana (Stripe webhook).",
      korisnikIme: "Stripe webhook",
    },
  });
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET nije postavljen.");
    return NextResponse.json(
      { error: "Webhook nije konfiguriran." },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Nedostaje stripe-signature zaglavlje." },
      { status: 400 },
    );
  }

  // Sirovi body — NUŽAN za verifikaciju potpisa. U Next App Router route
  // handleru req.text() vraća neparsirani body (nema body-parsera koji bi
  // se trebao isključiti, za razliku od starog Pages API-ja).
  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error(
      "[stripe-webhook] Neispravan potpis:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Neispravan potpis." }, { status: 400 });
  }

  try {
    // ── Gost je dovršio Checkout (kartica autorizirana, manual capture) ──
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const placanjeId = await nadiPlacanjeId(session);

      if (!placanjeId) {
        // Ne možemo povezati rezervaciju — trajna greška, retry ne pomaže.
        console.warn(
          "[stripe-webhook] completed bez placanjeId, session:",
          session.id,
        );
        return NextResponse.json({ received: true, skipped: "no_placanje" });
      }

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      const rezultat = await zaprimiAutoriziranuRezervaciju({
        placanjeId,
        paymentIntentId,
      });

      if (!rezultat.ok) {
        // krivi_tip / placanje_nije_pronadjeno — trajno, retry ne pomaže.
        console.warn(
          "[stripe-webhook] completed neobradivo:",
          rezultat.razlog,
          placanjeId,
        );
        return NextResponse.json({ received: true, skipped: rezultat.razlog });
      }

      return NextResponse.json({
        received: true,
        zaprimljeno: rezultat.zaprimljeno,
      });
    }

    // ── Checkout sesija istekla bez plaćanja ──
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const placanjeId = await nadiPlacanjeId(session);

      if (!placanjeId) {
        console.warn(
          "[stripe-webhook] expired bez placanjeId, session:",
          session.id,
        );
        return NextResponse.json({ received: true, skipped: "no_placanje" });
      }

      await ocistiIstekluRezervaciju(placanjeId);
      return NextResponse.json({ received: true });
    }

    // Ostali tipovi eventa — primljeno, ništa za napraviti.
    return NextResponse.json({ received: true, ignored: event.type });
  } catch (err) {
    // Prolazna greška (baza/Stripe privremeno nedostupni) — vrati 500
    // da Stripe ponovi isporuku eventa.
    console.error("[stripe-webhook] Greška kod obrade eventa:", event.type, err);
    return NextResponse.json(
      { error: "Greška kod obrade webhooka." },
      { status: 500 },
    );
  }
}
