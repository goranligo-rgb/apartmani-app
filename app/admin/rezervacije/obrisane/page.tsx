import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ObrisaneRezervacijePage() {
  const rezervacije = await prisma.rezervacija.findMany({
    where: {
      status: "OBRISANO",
    },
    include: {
      gost: true,
      jedinica: {
        include: { objekt: true },
      },
    },
    orderBy: {
      obrisanoAt: "desc",
    },
  });

  async function obnovi(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");

    const r = await prisma.rezervacija.findUnique({
      where: { id },
      select: {
        statusPrijeBrisanja: true,
      },
    });

    await prisma.rezervacija.update({
      where: { id },
      data: {
        status: r?.statusPrijeBrisanja || "POTVRDENO",
        statusPrijeBrisanja: null,
        obrisanoAt: null,
        obrisaoKorisnik: null,
      },
    });

    revalidatePath("/admin/rezervacije");
    revalidatePath("/admin/rezervacije/obrisane");
  }

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-3xl font-black mb-6">
        Obrisane rezervacije
      </h1>

      {rezervacije.length === 0 ? (
        <p className="text-gray-500">Nema obrisanih rezervacija.</p>
      ) : (
        <div className="space-y-3">
          {rezervacije.map((r) => (
            <div
              key={r.id}
              className="border bg-white p-4 shadow"
            >
              <div className="font-black">
                {r.gost?.ime} {r.gost?.prezime}
              </div>

              <div className="text-sm text-gray-600">
                {r.jedinica.objekt.naziv} / {r.jedinica.naziv}
              </div>

              <div className="text-xs text-gray-500">
                obrisano: {r.obrisanoAt?.toLocaleString("hr-HR")}
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/admin/rezervacije/${r.id}`}
                  className="border px-3 py-2 text-sm font-black"
                >
                  Otvori
                </Link>

                <form action={obnovi}>
                  <input type="hidden" name="id" value={r.id} />

                  <button className="border border-green-700 bg-green-700 px-3 py-2 text-sm font-black text-white">
                    Obnovi
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}