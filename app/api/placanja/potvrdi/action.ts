"use server";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function potvrdiPlacanje(placanjeId: string) {
  const placanje = await prisma.placanje.findUnique({
    where: { id: placanjeId },
  });

  if (!placanje) {
    throw new Error("Plaćanje ne postoji.");
  }

  if (placanje.status === "PLACENO") return;

  if (placanje.provider === "STRIPE") {
    let paymentIntentId = placanje.paymentIntentId;

    if (!paymentIntentId && placanje.providerId) {
      const session = await stripe.checkout.sessions.retrieve(
        placanje.providerId
      );

      const pi = session.payment_intent;
      paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? null;
    }

    if (!paymentIntentId) {
      throw new Error("Stripe payment intent nije pronađen.");
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status === "requires_capture") {
      await stripe.paymentIntents.capture(paymentIntentId);
    }
  }

  await prisma.placanje.update({
    where: { id: placanjeId },
    data: {
      status: "PLACENO",
      placenoAt: new Date(),
    },
  });
}