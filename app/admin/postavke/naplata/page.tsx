import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function boolFromForm(value: FormDataEntryValue | null) {
  return String(value || "") === "on";
}

export default async function AdminPostavkeNaplataPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;

  let postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!postavke) {
    postavke = await prisma.postavkeNaplate.create({
      data: {
        danaVrijediPozivAkontacije: 3,
        danaPrijeDolaskaSlanjeOstatka: 7,
        danaPrijeDolaskaMoraBitiPlaceno: 3,
        danaPrijeDolaskaPunaNaplata: 30,
        automatskiOtkaziBezAkontacije: true,
        automatskiSaljiPodsjetnikOstatka: true,
        adminEmails: null,
        tekstAdminNoveRezervacije: null,
      },
    });
  }

  async function spremiPostavke(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");

    const danaVrijediPozivAkontacije = Number(
      formData.get("danaVrijediPozivAkontacije") || 3
    );

    const danaPrijeDolaskaSlanjeOstatka = Number(
      formData.get("danaPrijeDolaskaSlanjeOstatka") || 7
    );

    const danaPrijeDolaskaMoraBitiPlaceno = Number(
      formData.get("danaPrijeDolaskaMoraBitiPlaceno") || 3
    );

    const danaPrijeDolaskaPunaNaplata = Number(
      formData.get("danaPrijeDolaskaPunaNaplata") || 30
    );

    const mailDanaPrije = Number(formData.get("mailDanaPrije") || 5);
    const smsDanaPrije = Number(formData.get("smsDanaPrije") || 3);

    const tekstPozivaAkontacije = String(
      formData.get("tekstPozivaAkontacije") || ""
    ).trim();

    const tekstPodsjetnikaOstatka = String(
      formData.get("tekstPodsjetnikaOstatka") || ""
    ).trim();

    const adminEmails = String(formData.get("adminEmails") || "").trim();

    const tekstAdminNoveRezervacije = String(
      formData.get("tekstAdminNoveRezervacije") || ""
    ).trim();

    if (
      !Number.isFinite(danaVrijediPozivAkontacije) ||
      danaVrijediPozivAkontacije < 1
    ) {
      throw new Error("Broj dana za poziv akontacije mora biti najmanje 1.");
    }

    if (
      !Number.isFinite(danaPrijeDolaskaSlanjeOstatka) ||
      danaPrijeDolaskaSlanjeOstatka < 0
    ) {
      throw new Error("Broj dana za slanje ostatka nije ispravan.");
    }

    if (
      !Number.isFinite(danaPrijeDolaskaMoraBitiPlaceno) ||
      danaPrijeDolaskaMoraBitiPlaceno < 0
    ) {
      throw new Error("Broj dana kada mora biti plaćeno nije ispravan.");
    }

    if (
      !Number.isFinite(danaPrijeDolaskaPunaNaplata) ||
      danaPrijeDolaskaPunaNaplata < 0
    ) {
      throw new Error("Broj dana za punu naplatu nije ispravan.");
    }

    if (!Number.isFinite(mailDanaPrije) || mailDanaPrije < 0) {
      throw new Error("Broj dana za welcome mail nije ispravan.");
    }

    if (!Number.isFinite(smsDanaPrije) || smsDanaPrije < 0) {
      throw new Error("Broj dana za SMS nije ispravan.");
    }

    await prisma.postavkeNaplate.update({
      where: { id },
      data: {
        danaVrijediPozivAkontacije,
        danaPrijeDolaskaSlanjeOstatka,
        danaPrijeDolaskaMoraBitiPlaceno,
        danaPrijeDolaskaPunaNaplata,
        mailDanaPrije,
        smsDanaPrije,
        appUrl: String(formData.get("appUrl") || "").trim() || null,
        automatskiOtkaziBezAkontacije: boolFromForm(
          formData.get("automatskiOtkaziBezAkontacije")
        ),
        automatskiSaljiPodsjetnikOstatka: boolFromForm(
          formData.get("automatskiSaljiPodsjetnikOstatka")
        ),
        tekstPozivaAkontacije: tekstPozivaAkontacije || null,
        tekstPodsjetnikaOstatka: tekstPodsjetnikaOstatka || null,
        adminEmails: adminEmails || null,
        tekstAdminNoveRezervacije: tekstAdminNoveRezervacije || null,
      },
    });

    revalidatePath("/admin/postavke/naplata");
    redirect("/admin/postavke/naplata?saved=1");
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
      <div className="mx-auto max-w-5xl text-[#2e2923]">
        <div className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          {saved === "1" && (
            <div className="mb-6 border border-green-300 bg-green-50 p-4 text-green-800 shadow">
              <div className="text-sm font-black uppercase tracking-[0.14em]">
                ✔ Postavke spremljene
              </div>
            </div>
          )}
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">Postavke</h1>

          <p className="mt-2 text-[#6f665a]">
            Pravila naplate, rokovi plaćanja, mailovi za nove rezervacije i URL
            aplikacije.
          </p>
        </div>

        <form
          action={spremiPostavke}
          className="border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]"
        >
          <input type="hidden" name="id" value={postavke.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="URL aplikacije"
              help="Lokalno može ostati prazno. Kad ide online, upiši npr. https://malinska-stay.hr bez / na kraju."
            >
              <input
                name="appUrl"
                defaultValue={postavke.appUrl || ""}
                placeholder="https://malinska-stay.hr"
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
              />
            </Field>

            <Field
              label="Puna naplata prije dolaska"
              help="Ako je dolazak za ovoliko dana ili manje, gost plaća 100% odmah."
            >
              <input
                name="danaPrijeDolaskaPunaNaplata"
                type="number"
                min={0}
                defaultValue={postavke.danaPrijeDolaskaPunaNaplata}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field
              label="Poziv za akontaciju vrijedi dana"
              help="Ako gost ne uplati u tom roku, rezervacija može ići u storno."
            >
              <input
                name="danaVrijediPozivAkontacije"
                type="number"
                min={1}
                defaultValue={postavke.danaVrijediPozivAkontacije}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>

            <Field
              label="Slanje ostatka prije dolaska"
              help="Koliko dana prije dolaska se šalje mail za uplatu ostatka."
            >
              <input
                name="danaPrijeDolaskaSlanjeOstatka"
                type="number"
                min={0}
                defaultValue={postavke.danaPrijeDolaskaSlanjeOstatka}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>

            <Field
              label="Sve mora biti plaćeno prije dolaska"
              help="Koliko dana prije dolaska gost mora imati plaćeno sve."
            >
              <input
                name="danaPrijeDolaskaMoraBitiPlaceno"
                type="number"
                min={0}
                defaultValue={postavke.danaPrijeDolaskaMoraBitiPlaceno}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Welcome mail - dana prije dolaska"
              help="Koliko dana prije dolaska cron šalje welcome mail gostu."
            >
              <input
                name="mailDanaPrije"
                type="number"
                min={0}
                defaultValue={postavke.mailDanaPrije}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>

            <Field
              label="SMS - dana prije dolaska"
              help="Koliko dana prije dolaska cron šalje check-in SMS gostu."
            >
              <input
                name="smsDanaPrije"
                type="number"
                min={0}
                defaultValue={postavke.smsDanaPrije}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                required
              />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 border border-[#e2d8c8] bg-[#fcfaf6] p-4">
              <input
                name="automatskiOtkaziBezAkontacije"
                type="checkbox"
                defaultChecked={postavke.automatskiOtkaziBezAkontacije}
                className="mt-1"
              />
              <span>
                <span className="block font-black text-[#2e2923]">
                  Automatski storniraj bez akontacije
                </span>
                <span className="mt-1 block text-sm text-[#6f665a]">
                  Ako akontacija nije plaćena do roka, rezervacija se može
                  automatski otkazati.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 border border-[#e2d8c8] bg-[#fcfaf6] p-4">
              <input
                name="automatskiSaljiPodsjetnikOstatka"
                type="checkbox"
                defaultChecked={postavke.automatskiSaljiPodsjetnikOstatka}
                className="mt-1"
              />
              <span>
                <span className="block font-black text-[#2e2923]">
                  Automatski šalji podsjetnik za ostatak
                </span>
                <span className="mt-1 block text-sm text-[#6f665a]">
                  Sustav može slati mail za uplatu ostatka prije dolaska.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-6 border border-[#ead7b6] bg-[#fff9ef] p-4">
            <h2 className="text-xl font-black text-[#2e2923]">
              Mail za novu web rezervaciju
            </h2>

            <p className="mt-1 text-sm text-[#7a5a22]">
              Ovdje upiši mailove na koje dolazi obavijest kad gost napravi
              novu web rezervaciju koja čeka potvrdu.
            </p>

            <div className="mt-4 grid gap-4">
              <Field
                label="Emailovi za obavijest"
                help="Možeš upisati jedan ili više mailova. Odvoji ih zarezom."
              >
                <input
                  name="adminEmails"
                  defaultValue={postavke.adminEmails || ""}
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                  placeholder="goran@ligo.hr, rezervacije@malinska-stay.hr, treci@mail.com"
                />
              </Field>

              <Field
                label="Tekst maila"
                help="Možeš koristiti oznake: {{ime}}, {{prezime}}, {{email}}, {{telefon}}, {{objekt}}, {{jedinica}}, {{datumOd}}, {{datumDo}}, {{brojOsoba}}, {{ukupno}}, {{zaNaplatu}}, {{link}}"
              >
                <textarea
                  name="tekstAdminNoveRezervacije"
                  rows={12}
                  defaultValue={postavke.tekstAdminNoveRezervacije || ""}
                  className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                  placeholder={`Nova rezervacija čeka potvrdu.

Gost: {{ime}} {{prezime}}
Email: {{email}}
Telefon: {{telefon}}

Objekt: {{objekt}}
Jedinica: {{jedinica}}
Termin: {{datumOd}} - {{datumDo}}
Broj osoba: {{brojOsoba}}

Ukupno: {{ukupno}}
Za naplatu: {{zaNaplatu}}

Otvori rezervaciju:
{{link}}`}
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field
              label="Tekst poziva za uplatu akontacije"
              help="Ako ostaviš prazno, koristit ćemo zadani tekst maila."
            >
              <textarea
                name="tekstPozivaAkontacije"
                rows={8}
                defaultValue={postavke.tekstPozivaAkontacije || ""}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                placeholder="Poštovani, vaša rezervacija je evidentirana. Molimo uplatu akontacije..."
              />
            </Field>

            <Field
              label="Tekst podsjetnika za uplatu ostatka"
              help="Ako ostaviš prazno, koristit ćemo zadani tekst maila."
            >
              <textarea
                name="tekstPodsjetnikaOstatka"
                rows={8}
                defaultValue={postavke.tekstPodsjetnikaOstatka || ""}
                className="w-full border border-[#d8c8aa] bg-white px-3 py-3 text-[#2e2923] outline-none"
                placeholder="Poštovani, podsjećamo vas na uplatu ostatka iznosa..."
              />
            </Field>
          </div>

          <div className="mt-6 border border-[#ead7b6] bg-[#fff9ef] p-4 text-sm text-[#7a5a22]">
            Ove postavke će se koristiti kao zadane vrijednosti kod novih
            rezervacija. Lokalno URL aplikacije može biti prazan. Online upiši
            punu domenu.
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95">
              Spremi postavke
            </button>

            <Link
              href="/admin"
              className="cursor-pointer border border-[#d8c8aa] bg-white px-5 py-3 text-sm font-black text-[#7a5a22] transition hover:bg-[#fff6e2]"
            >
              Odustani
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
        {label}
      </div>

      {children}

      {help && <div className="mt-1 text-xs text-[#6f665a]">{help}</div>}
    </label>
  );
}