import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  session_id?: string;
}>;

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

export default async function RezervacijaUspjehPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session_id || "";

  if (!sessionId) {
    return (
      <main className="min-h-screen p-8">
        <h1>Nedostaje Stripe session ID.</h1>
      </main>
    );
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const rezervacijaId = String(session.metadata?.rezervacijaId || "");
  const placanjeId = String(session.metadata?.placanjeId || "");

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  if (!rezervacijaId || !placanjeId || !paymentIntentId) {
    return (
      <main className="min-h-screen p-8">
        <h1>Nedostaju podaci o rezervaciji ili plaćanju.</h1>
      </main>
    );
  }

  const postojecePlacanje = await prisma.placanje.findUnique({
    where: { id: placanjeId },
  });

  const trebaPoslatiMail = !postojecePlacanje?.autoriziranoAt;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.placanje.update({
      where: { id: placanjeId },
      data: {
        provider: "STRIPE",
        providerId: session.id,
        paymentIntentId,
        paymentUrl: null,
        autoriziranoAt: postojecePlacanje?.autoriziranoAt || new Date(),
        expiresAt: postojecePlacanje?.expiresAt || expiresAt,
        napomena:
          "Stripe kartica je autorizirana. Sredstva su rezervirana, ali još nisu naplaćena.",
      },
    });

    if (trebaPoslatiMail) {
      await tx.rezervacijaPromjena.create({
        data: {
          rezervacijaId,
          tip: "STRIPE_AUTORIZACIJA",
          opis:
            "Kartica gosta je uspješno autorizirana preko Stripea. Novac još nije naplaćen.",
          noviPodaci: JSON.stringify({
            stripeSessionId: session.id,
            paymentIntentId,
            expiresAt,
          }),
          korisnikIme: "Stripe",
        },
      });
    }
  });

  const rezervacija = await prisma.rezervacija.findUnique({
    where: { id: rezervacijaId },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
      placanja: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!rezervacija) {
    return (
      <main className="min-h-screen p-8">
        <h1>Rezervacija nije pronađena.</h1>
      </main>
    );
  }

  if (trebaPoslatiMail && rezervacija.gost?.email) {
    const gostIme = `${rezervacija.gost.ime || "Poštovani"} ${
      rezervacija.gost.prezime || "gost"
    }`.trim();

    await sendMail({
      to: rezervacija.gost.email,
      subject: "Rezervacija zaprimljena",
      html: `
        <h2>Rezervacija zaprimljena</h2>

        <p>Poštovani ${gostIme},</p>

        <p>Vaša rezervacija je uspješno zaprimljena.</p>

        <p>
          <strong>Objekt:</strong> ${rezervacija.jedinica.objekt.naziv}<br/>
          <strong>Smještajna jedinica:</strong> ${rezervacija.jedinica.naziv}<br/>
          <strong>Dolazak:</strong> ${formatDate(rezervacija.datumOd)}<br/>
          <strong>Odlazak:</strong> ${formatDate(rezervacija.datumDo)}<br/>
          <strong>Broj noćenja:</strong> ${rezervacija.brojNocenja}<br/>
          <strong>Broj osoba:</strong> ${rezervacija.brojOsoba}
        </p>

        <p>
          Vaša kartica je uspješno autorizirana za iznos ${money(
            rezervacija.iznosPotvrde
          )}.
          Novac još nije naplaćen, nego su sredstva samo rezervirana do konačne potvrde rezervacije.
        </p>

        <p>
          Nakon obrade rezervacije poslat ćemo vam konačnu potvrdu.
          Račun se šalje tek nakon stvarne naplate.
        </p>

        <br/>
        <p>Lijep pozdrav,<br/>Malinska Stay</p>
      `,
    });
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-3xl border border-white/70 bg-white p-8 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
        <div className="border border-[#d7c39a] bg-[#fff7e8] p-5">
          <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#9a6b23]">
            Rezervacija zaprimljena
          </div>

          <h1 className="mt-3 text-3xl font-bold text-[#2e2923]">
            Kartica je uspješno autorizirana
          </h1>

          <p className="mt-3 text-[#6f665a]">
            Sredstva su samo rezervirana na kartici. Novac još nije naplaćen.
            Rezervacija će biti konačno potvrđena nakon provjere dostupnosti.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Box label="Objekt" value={rezervacija.jedinica.objekt.naziv} />
          <Box label="Jedinica" value={rezervacija.jedinica.naziv} />
          <Box
            label="Gost"
            value={`${rezervacija.gost.ime} ${rezervacija.gost.prezime}`}
          />
          <Box label="Email" value={rezervacija.gost.email} />
          <Box label="Dolazak" value={formatDate(rezervacija.datumOd)} />
          <Box label="Odlazak" value={formatDate(rezervacija.datumDo)} />
          <Box label="Broj noćenja" value={String(rezervacija.brojNocenja)} />
          <Box label="Broj osoba" value={String(rezervacija.brojOsoba)} />
          <Box
            label="Ukupna cijena"
            value={money(rezervacija.iznosUkupno)}
          />
          <Box
            label="Autorizirano"
            value={money(rezervacija.iznosPotvrde)}
          />
        </div>

        <div className="mt-8 border border-[#e7dece] bg-[#fcfaf6] p-5 text-[#2e2923]">
          <div className="font-bold">Što dalje?</div>
          <p className="mt-2 text-[#6f665a]">
            Poslat ćemo potvrdu rezervacije nakon obrade. Ako rezervacija ne
            bude potvrđena, autorizacija kartice se poništava i sredstva se ne
            skidaju.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 font-bold text-white transition hover:brightness-95"
          >
            Povratak na početnu
          </Link>
        </div>
      </div>
    </main>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e7dece] bg-[#fcfaf6] p-4">
      <div className="text-sm text-[#8c7f71]">{label}</div>
      <div className="mt-1 font-bold text-[#2e2923]">{value}</div>
    </div>
  );
}