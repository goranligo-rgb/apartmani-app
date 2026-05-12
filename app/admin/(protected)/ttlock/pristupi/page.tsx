import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function dodajOsobu(formData: FormData) {
    "use server";

    const ime = String(formData.get("ime") || "").trim();
    const prezime = String(formData.get("prezime") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const telefon = String(formData.get("telefon") || "").trim();
    const tip = String(formData.get("tip") || "OSTALO");
    const sifra = String(formData.get("sifra") || "").trim();

    if (!ime || !sifra) return;

    await prisma.ttlockOsoba.create({
        data: {
            ime,
            prezime: prezime || null,
            email: email || null,
            telefon: telefon || null,
            tip: tip as any,

            pristupi: {
                create: {
                    naziv: `${ime} ${prezime}`.trim(),
                    sifra,
                },
            },
        },
    });

    revalidatePath("/admin/ttlock/pristupi");
}

async function poveziBravu(formData: FormData) {
    "use server";

    const pristupId = String(formData.get("pristupId") || "");
    const bravaId = String(formData.get("bravaId") || "");

    if (!pristupId || !bravaId) return;

    await prisma.ttlockPristupBrava.upsert({
        where: {
            pristupId_bravaId: {
                pristupId,
                bravaId,
            },
        },
        update: {},
        create: {
            pristupId,
            bravaId,
        },
    });

    revalidatePath("/admin/ttlock/pristupi");
}

async function makniBravu(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");

    if (!id) return;

    await prisma.ttlockPristupBrava.deleteMany({
        where: { id },
    });

    revalidatePath("/admin/ttlock/pristupi");
}

async function obrisiOsobu(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");

    if (!id) return;

    await prisma.ttlockOsoba.deleteMany({
        where: { id },
    });

    revalidatePath("/admin/ttlock/pristupi");
}

export default async function TtlockPristupiPage() {
    const [osobe, brave] = await Promise.all([
        prisma.ttlockOsoba.findMany({
            include: {
                pristupi: {
                    include: {
                        brave: {
                            include: {
                                brava: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                ime: "asc",
            },
        }),

        prisma.ttlockBrava.findMany({
            orderBy: {
                naziv: "asc",
            },
        }),
    ]);

    return (
        <main className="min-h-screen bg-[#f7f2e8] px-4 py-6 text-[#2f261d] md:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                    <h1 className="text-3xl font-bold">TTLock pristupi</h1>

                    <p className="mt-2 text-sm text-[#6f6255]">
                        Dodaj osobu i klikom joj dodijeli koje brave može otvarati.
                    </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
                    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                        <h2 className="text-xl font-bold">Dodaj osobu</h2>

                        <form action={dodajOsobu} className="mt-5 space-y-4">
                            <input
                                name="ime"
                                placeholder="Ime"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                                required
                            />

                            <input
                                name="prezime"
                                placeholder="Prezime"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                            />

                            <select
                                name="tip"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                                defaultValue="CISTACICA"
                            >
                                <option value="CISTACICA">Čistačica</option>
                                <option value="VLASNIK">Vlasnik</option>
                                <option value="SERVIS">Servis</option>
                                <option value="OSTALO">Ostalo</option>
                            </select>

                            <input
                                name="telefon"
                                placeholder="Telefon"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                            />

                            <input
                                name="email"
                                placeholder="Email"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                            />

                            <input
                                name="sifra"
                                placeholder="Šifra"
                                className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm"
                                required
                            />

                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-[#2f261d] px-5 py-3 text-sm font-bold text-white"
                            >
                                Spremi osobu
                            </button>
                        </form>
                    </section>

                    <section className="space-y-4">
                        {osobe.map((osoba) => {
                            const pristup = osoba.pristupi[0];

                            return (
                                <div
                                    key={osoba.id}
                                    className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8a6a3f]">
                                                {osoba.tip.replaceAll("_", " ")}
                                            </p>

                                            <h2 className="mt-1 text-2xl font-bold">
                                                {osoba.ime} {osoba.prezime || ""}
                                            </h2>

                                            <p className="mt-2 text-sm text-[#6f6255]">
                                                Šifra:{" "}
                                                <span className="font-bold">
                                                    {pristup?.sifra || "-"}
                                                </span>
                                            </p>
                                        </div>

                                        <form action={obrisiOsobu}>
                                            <input type="hidden" name="id" value={osoba.id} />

                                            <button
                                                type="submit"
                                                className="rounded-2xl bg-red-100 px-4 py-2 text-sm font-bold text-red-800"
                                            >
                                                Obriši
                                            </button>
                                        </form>
                                    </div>

                                    <div className="mt-5">
                                        <h3 className="text-lg font-bold">
                                            Dodijeljene brave
                                        </h3>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {pristup?.brave?.map((b) => (
                                                <form
                                                    key={b.id}
                                                    action={makniBravu}
                                                    className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-2 text-sm"
                                                >
                                                    <input type="hidden" name="id" value={b.id} />

                                                    <span className="font-semibold">
                                                        {b.brava.naziv}
                                                    </span>

                                                    <button
                                                        type="submit"
                                                        className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800"
                                                    >
                                                        makni
                                                    </button>
                                                </form>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-5">
                                        <h3 className="text-lg font-bold">
                                            Sve brave
                                        </h3>

                                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {brave.map((brava) => {
                                                const veza = pristup?.brave?.find(
                                                    (b) => b.bravaId === brava.id
                                                );

                                                const postoji = Boolean(veza);

                                                return (
                                                    <form
                                                        key={brava.id}
                                                        action={postoji ? makniBravu : poveziBravu}
                                                        className={`rounded-2xl border p-3 ${postoji
                                                                ? "border-green-300 bg-green-50"
                                                                : "border-[#eadcc8] bg-[#fffaf2]"
                                                            }`}
                                                    >
                                                        {postoji ? (
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={veza?.id || ""}
                                                            />
                                                        ) : (
                                                            <>
                                                                <input
                                                                    type="hidden"
                                                                    name="pristupId"
                                                                    value={pristup?.id || ""}
                                                                />

                                                                <input
                                                                    type="hidden"
                                                                    name="bravaId"
                                                                    value={brava.id}
                                                                />
                                                            </>
                                                        )}

                                                        <p className="text-sm font-bold">
                                                            {brava.naziv}
                                                        </p>

                                                        <button
                                                            type="submit"
                                                            className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-bold ${postoji
                                                                    ? "bg-red-100 text-red-800"
                                                                    : "bg-[#2f261d] text-white"
                                                                }`}
                                                        >
                                                            {postoji
                                                                ? "Makni pristup"
                                                                : "Dodijeli pristup"}
                                                        </button>
                                                    </form>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                </div>
            </div>
        </main>
    );
}