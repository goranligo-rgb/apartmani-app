import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function boolFromForm(value: FormDataEntryValue | null) {
  return String(value || "") === "on";
}

export default async function AdminPostavkeNaplatePage() {
  let postavke = await prisma.postavkeNaplate.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!postavke) {
    postavke = await prisma.postavkeNaplate.create({
      data: {
        danaVrijediPozivAkontacije: 3,
        danaPrijeDolaskaSlanjeOstatka: 7,
        danaPrijeDolaskaMoraBitiPlaceno: 3,
        automatskiOtkaziBezAkontacije: true,
        automatskiSaljiPodsjetnikOstatka: true,
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

    const tekstPozivaAkontacije = String(
      formData.get("tekstPozivaAkontacije") || ""
    ).trim();

    const tekstPodsjetnikaOstatka = String(
      formData.get("tekstPodsjetnikaOstatka") || ""
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

    await prisma.postavkeNaplate.update({
      where: { id },
      data: {
        danaVrijediPozivAkontacije,
        danaPrijeDolaskaSlanjeOstatka,
        danaPrijeDolaskaMoraBitiPlaceno,
        automatskiOtkaziBezAkontacije: boolFromForm(
          formData.get("automatskiOtkaziBezAkontacije")
        ),
        automatskiSaljiPodsjetnikOstatka: boolFromForm(
          formData.get("automatskiSaljiPodsjetnikOstatka")
        ),
        tekstPozivaAkontacije: tekstPozivaAkontacije || null,
        tekstPodsjetnikaOstatka: tekstPodsjetnikaOstatka || null,
      },
    });

    revalidatePath("/admin/postavke/naplata");
    redirect("/admin/postavke/naplata");
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, #2dd4bf 0%, transparent 28%), radial-gradient(circle at top right, #7c3aed 0%, transparent 32%), linear-gradient(135deg, #060816 0%, #0b1024 45%, #120818 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl text-white">
        <div className="mb-6 border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-cyan-200 hover:text-white"
          >
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">Postavke naplate</h1>

          <p className="mt-2 text-slate-300">
            Ovdje se podešava koliko vrijedi poziv za uplatu, kada se šalje
            ostatak i kada sve mora biti plaćeno.
          </p>
        </div>

        <form
          action={spremiPostavke}
          className="border border-white/15 bg-white/10 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        >
          <input type="hidden" name="id" value={postavke.id} />

          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Poziv za akontaciju vrijedi dana"
              help="Ako gost ne uplati u tom roku, rezervacija može ići u storno."
            >
              <input
                name="danaVrijediPozivAkontacije"
                type="number"
                min={1}
                defaultValue={postavke.danaVrijediPozivAkontacije}
                className="w-full border border-white/15 bg-black/25 px-3 py-3 text-white outline-none"
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
                className="w-full border border-white/15 bg-black/25 px-3 py-3 text-white outline-none"
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
                className="w-full border border-white/15 bg-black/25 px-3 py-3 text-white outline-none"
                required
              />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/20 p-4">
              <input
                name="automatskiOtkaziBezAkontacije"
                type="checkbox"
                defaultChecked={postavke.automatskiOtkaziBezAkontacije}
                className="mt-1"
              />

              <span>
                <span className="block font-black text-white">
                  Automatski storniraj bez akontacije
                </span>
                <span className="mt-1 block text-sm text-slate-300">
                  Ako akontacija nije plaćena do roka, rezervacija se može
                  automatski otkazati.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/20 p-4">
              <input
                name="automatskiSaljiPodsjetnikOstatka"
                type="checkbox"
                defaultChecked={postavke.automatskiSaljiPodsjetnikOstatka}
                className="mt-1"
              />

              <span>
                <span className="block font-black text-white">
                  Automatski šalji podsjetnik za ostatak
                </span>
                <span className="mt-1 block text-sm text-slate-300">
                  Sustav može slati mail za uplatu ostatka prije dolaska.
                </span>
              </span>
            </label>
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
                className="w-full border border-white/15 bg-black/25 px-3 py-3 text-white outline-none"
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
                className="w-full border border-white/15 bg-black/25 px-3 py-3 text-white outline-none"
                placeholder="Poštovani, podsjećamo vas na uplatu ostatka iznosa..."
              />
            </Field>
          </div>

          <div className="mt-6 border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            Ove postavke će se koristiti kao zadane vrijednosti kod novih
            rezervacija. Kod pojedine rezervacije admin ih kasnije može
            promijeniti ako je dogovor drugačiji.
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="cursor-pointer border border-emerald-300 bg-emerald-300/20 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/30">
              Spremi postavke naplate
            </button>

            <Link
              href="/admin"
              className="cursor-pointer border border-white/20 bg-black/20 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-white/10"
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
      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-cyan-200">
        {label}
      </div>

      {children}

      {help && <div className="mt-1 text-xs text-slate-400">{help}</div>}
    </label>
  );
}