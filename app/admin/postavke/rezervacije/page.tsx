import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export default async function PostavkeRezervacija() {
  const postavke =
    (await prisma.postavkeNaplate.findFirst({
      orderBy: { createdAt: "asc" },
    })) || (await prisma.postavkeNaplate.create({ data: {} }));

  async function spremi(formData: FormData) {
    "use server";

    const dana = Number(formData.get("dana") || 30);

    await prisma.postavkeNaplate.update({
      where: { id: postavke.id },
      data: {
        danaPrijeDolaskaPunaNaplata: dana,
      },
    });

    revalidatePath("/admin/postavke/rezervacije");
  }

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-2xl font-black mb-6">
        Postavke rezervacija
      </h1>

      <form action={spremi} className="space-y-4">
        <div>
          <label className="block text-sm font-bold mb-1">
            Koliko dana prije dolaska ide 100% naplata
          </label>

          <input
            name="dana"
            type="number"
            defaultValue={postavke.danaPrijeDolaskaPunaNaplata}
            className="border px-3 py-2 w-full"
          />
        </div>

        <button className="border px-4 py-2 font-black bg-black text-white">
          Spremi
        </button>
      </form>
    </main>
  );
}