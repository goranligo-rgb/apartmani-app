import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function privremeniLockId(naziv: string) {
    const clean = naziv
        .trim()
        .toUpperCase()
        .replace(/Č/g, "C")
        .replace(/Ć/g, "C")
        .replace(/Š/g, "S")
        .replace(/Đ/g, "D")
        .replace(/Ž/g, "Z")
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return `TEMP-${clean || "BRAVA"}-${Date.now()}`;
}

async function dodajOsnovneBrave() {
    "use server";

    const brave = [
        { naziv: "Marty glavni ulaz", lockId: "MARTY-GLAVNI-ULAZ", tip: "GLAVNI_ULAZ", objektNaziv: "Marty" },
        { naziv: "Marty 1 vrata", lockId: "MARTY-1-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Marty" },
        { naziv: "Marty 2 vrata", lockId: "MARTY-2-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Marty" },
        { naziv: "Marty 3 vrata", lockId: "MARTY-3-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Marty" },
        { naziv: "Marty 4 vrata", lockId: "MARTY-4-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Marty" },
        { naziv: "Marty 5 vrata", lockId: "MARTY-5-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Marty" },
        { naziv: "Eva glavni ulaz", lockId: "EVA-GLAVNI-ULAZ", tip: "GLAVNI_ULAZ", objektNaziv: "Eva" },
        { naziv: "Eva 1 vrata", lockId: "EVA-1-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Eva" },
        { naziv: "Eva 2 vrata", lockId: "EVA-2-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Eva" },
        { naziv: "Eva 3 vrata", lockId: "EVA-3-VRATA", tip: "VRATA_JEDINICE", objektNaziv: "Eva" },
        { naziv: "House Art glavni ulaz", lockId: "ART-GLAVNI-ULAZ", tip: "GLAVNI_ULAZ", objektNaziv: "House Art" },
        { naziv: "House Art ulaz", lockId: "ART-ULAZ", tip: "VRATA_JEDINICE", objektNaziv: "House Art" },
    ];

    for (const brava of brave) {
        await prisma.ttlockBrava.upsert({
            where: { lockId: brava.lockId },
            update: {
                naziv: brava.naziv,
                tip: brava.tip as any,
                objektNaziv: brava.objektNaziv,
                aktivna: true,
            },
            create: {
                naziv: brava.naziv,
                lockId: brava.lockId,
                tip: brava.tip as any,
                objektNaziv: brava.objektNaziv,
                aktivna: true,
            },
        });
    }

    revalidatePath("/admin/ttlock");
    revalidatePath("/admin/ttlock/pristupi");
}

async function dodajBravu(formData: FormData) {
    "use server";

    const naziv = String(formData.get("naziv") || "").trim();
    const lockIdRaw = String(formData.get("lockId") || "").trim();
    const tip = String(formData.get("tip") || "VRATA_JEDINICE");
    const objektNaziv = String(formData.get("objektNaziv") || "").trim();
    const napomena = String(formData.get("napomena") || "").trim();

    if (!naziv) return;

    const lockId = lockIdRaw || privremeniLockId(naziv);

    await prisma.ttlockBrava.upsert({
        where: { lockId },
        update: {
            naziv,
            tip: tip as any,
            objektNaziv: objektNaziv || null,
            napomena: napomena || null,
            aktivna: true,
        },
        create: {
            naziv,
            lockId,
            tip: tip as any,
            objektNaziv: objektNaziv || null,
            napomena: napomena || null,
            aktivna: true,
        },
    });

    revalidatePath("/admin/ttlock");
    revalidatePath("/admin/ttlock/pristupi");
}

async function urediBravu(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const naziv = String(formData.get("naziv") || "").trim();
    const lockIdRaw = String(formData.get("lockId") || "").trim();
    const tip = String(formData.get("tip") || "VRATA_JEDINICE");
    const objektNaziv = String(formData.get("objektNaziv") || "").trim();
    const napomena = String(formData.get("napomena") || "").trim();

    if (!id || !naziv) return;

    const lockId = lockIdRaw || privremeniLockId(naziv);

    await prisma.ttlockBrava.update({
        where: { id },
        data: {
            naziv,
            lockId,
            tip: tip as any,
            objektNaziv: objektNaziv || null,
            napomena: napomena || null,
            aktivna: true,
        },
    });

    revalidatePath("/admin/ttlock");
    revalidatePath("/admin/ttlock/pristupi");
}

async function poveziBravu(formData: FormData) {
    "use server";

    const jedinicaId = String(formData.get("jedinicaId") || "");
    const bravaId = String(formData.get("bravaId") || "");
    const glavnaZaJedinicu = formData.get("glavnaZaJedinicu") === "true";

    if (!jedinicaId || !bravaId) return;

    await prisma.jedinicaTtlockBrava.upsert({
        where: {
            jedinicaId_bravaId: {
                jedinicaId,
                bravaId,
            },
        },
        update: {
            glavnaZaJedinicu,
        },
        create: {
            jedinicaId,
            bravaId,
            glavnaZaJedinicu,
        },
    });

    revalidatePath("/admin/ttlock");
}

async function ukloniPoveznicu(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    if (!id) return;

    await prisma.jedinicaTtlockBrava.deleteMany({
        where: { id },
    });

    revalidatePath("/admin/ttlock");
}

async function obrisiBravu(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    if (!id) return;

    await prisma.$transaction([
        prisma.jedinicaTtlockBrava.deleteMany({
            where: { bravaId: id },
        }),
        prisma.ttlockPristupBrava.deleteMany({
            where: { bravaId: id },
        }),
        prisma.rezervacijaTtlockSifra.deleteMany({
            where: { bravaId: id },
        }),
        prisma.ttlockBrava.deleteMany({
            where: { id },
        }),
    ]);

    revalidatePath("/admin/ttlock");
    revalidatePath("/admin/ttlock/pristupi");
}

export default async function AdminTtlockPage() {
    const [brave, jedinice] = await Promise.all([
        prisma.ttlockBrava.findMany({
            orderBy: [{ aktivna: "desc" }, { objektNaziv: "asc" }, { naziv: "asc" }],
        }),

        prisma.jedinica.findMany({
            where: { aktivna: true },
            include: {
                objekt: true,
                ttlockBrave: {
                    include: { brava: true },
                    orderBy: { sortOrder: "asc" },
                },
            },
            orderBy: [
                { objekt: { naziv: "asc" } },
                { sortOrder: "asc" },
                { naziv: "asc" },
            ],
        }),
    ]);

    const aktivneBrave = brave.filter((b) => b.aktivna);

    return (
        <main className="min-h-screen bg-[#f7f2e8] px-4 py-6 text-[#2f261d] md:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8a6a3f]">
                        Malinska Stay
                    </p>

                    <h1 className="mt-2 text-3xl font-bold">TTLock brave</h1>

                    <p className="mt-2 max-w-3xl text-sm text-[#6f6255]">
                        Svaka brava je zasebna. Ako još nemaš pravi TTLock lockId,
                        možeš ga ostaviti praznog pa ga kasnije upisati preko gumba Uredi.
                    </p>

                    <form action={dodajOsnovneBrave} className="mt-4">
                        <button
                            type="submit"
                            className="rounded-2xl bg-[#2f261d] px-5 py-3 text-sm font-bold text-white hover:bg-[#4a3827]"
                        >
                            Dodaj osnovne brave
                        </button>
                    </form>
                </div>

                <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                    <section className="space-y-6">
                        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                            <h2 className="text-xl font-bold">Dodaj bravu</h2>

                            <form action={dodajBravu} className="mt-5 space-y-4">
                                <input
                                    name="naziv"
                                    placeholder="npr. Marty 1 vrata"
                                    className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm outline-none focus:border-[#9c7a45]"
                                    required
                                />

                                <input
                                    name="lockId"
                                    placeholder="TTLock lockId - može ostati prazno"
                                    className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm outline-none focus:border-[#9c7a45]"
                                />

                                <select
                                    name="tip"
                                    className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm outline-none focus:border-[#9c7a45]"
                                    defaultValue="VRATA_JEDINICE"
                                >
                                    <option value="GLAVNI_ULAZ">Glavni ulaz</option>
                                    <option value="VRATA_JEDINICE">Vrata jedinice</option>
                                    <option value="KAPIJA">Kapija</option>
                                    <option value="OSTALO">Ostalo</option>
                                </select>

                                <select
                                    name="objektNaziv"
                                    className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm outline-none focus:border-[#9c7a45]"
                                    required
                                    defaultValue=""
                                >
                                    <option value="" disabled>
                                        Odaberi objekt
                                    </option>
                                    <option value="Marty">Marty</option>
                                    <option value="Eva">Eva</option>
                                    <option value="House Art">House Art</option>
                                </select>

                                <textarea
                                    name="napomena"
                                    placeholder="Napomena"
                                    rows={3}
                                    className="w-full rounded-2xl border border-[#ddd0bd] bg-[#fffaf2] px-4 py-3 text-sm outline-none focus:border-[#9c7a45]"
                                />

                                <button
                                    type="submit"
                                    className="w-full rounded-2xl bg-[#8a6a3f] px-5 py-3 text-sm font-bold text-white hover:bg-[#6f5430]"
                                >
                                    Spremi bravu
                                </button>
                            </form>
                        </div>

                        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                            <h2 className="text-xl font-bold">Sve brave</h2>

                            <div className="mt-4 space-y-3">
                                {brave.length === 0 ? (
                                    <p className="rounded-2xl bg-[#fff7e8] p-4 text-sm text-[#7a6a58]">
                                        Još nema brava.
                                    </p>
                                ) : (
                                    brave.map((brava) => (
                                        <details
                                            key={brava.id}
                                            className="rounded-2xl border border-[#eadcc8] bg-[#fffaf2] p-4"
                                        >
                                            <summary className="cursor-pointer list-none">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-bold">{brava.naziv}</p>
                                                        <p className="mt-1 text-xs text-[#7a6a58]">
                                                            {brava.objektNaziv || "-"} ·{" "}
                                                            {brava.tip.replaceAll("_", " ")}
                                                        </p>
                                                        <p className="mt-1 text-xs text-[#7a6a58]">
                                                            lockId: {brava.lockId}
                                                        </p>
                                                    </div>

                                                    <span className="rounded-xl bg-[#2f261d] px-3 py-2 text-xs font-bold text-white">
                                                        Uredi
                                                    </span>
                                                </div>
                                            </summary>

                                            <form action={urediBravu} className="mt-4 space-y-3">
                                                <input type="hidden" name="id" value={brava.id} />

                                                <input
                                                    name="naziv"
                                                    defaultValue={brava.naziv}
                                                    className="w-full rounded-xl border border-[#d8c8b2] bg-white px-3 py-2 text-sm font-bold"
                                                />

                                                <input
                                                    name="lockId"
                                                    defaultValue={brava.lockId}
                                                    placeholder="TTLock lockId"
                                                    className="w-full rounded-xl border border-[#d8c8b2] bg-white px-3 py-2 text-xs"
                                                />

                                                <select
                                                    name="tip"
                                                    defaultValue={brava.tip}
                                                    className="w-full rounded-xl border border-[#d8c8b2] bg-white px-3 py-2 text-xs"
                                                >
                                                    <option value="GLAVNI_ULAZ">Glavni ulaz</option>
                                                    <option value="VRATA_JEDINICE">Vrata jedinice</option>
                                                    <option value="KAPIJA">Kapija</option>
                                                    <option value="OSTALO">Ostalo</option>
                                                </select>

                                                <select
                                                    name="objektNaziv"
                                                    defaultValue={brava.objektNaziv || ""}
                                                    className="w-full rounded-xl border border-[#d8c8b2] bg-white px-3 py-2 text-xs"
                                                >
                                                    <option value="">Bez objekta</option>
                                                    <option value="Marty">Marty</option>
                                                    <option value="Eva">Eva</option>
                                                    <option value="House Art">House Art</option>
                                                </select>

                                                <textarea
                                                    name="napomena"
                                                    defaultValue={brava.napomena || ""}
                                                    placeholder="Napomena"
                                                    rows={2}
                                                    className="w-full rounded-xl border border-[#d8c8b2] bg-white px-3 py-2 text-xs"
                                                />

                                                <div className="flex gap-2">
                                                    <button
                                                        type="submit"
                                                        className="flex-1 rounded-xl bg-[#2f261d] px-3 py-2 text-xs font-bold text-white hover:bg-[#4a3827]"
                                                    >
                                                        Spremi promjene
                                                    </button>
                                                </div>
                                            </form>

                                            <form action={obrisiBravu} className="mt-2">
                                                <input type="hidden" name="id" value={brava.id} />

                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl bg-red-100 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-200"
                                                >
                                                    Obriši bravu
                                                </button>
                                            </form>
                                        </details>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                        <h2 className="text-xl font-bold">Poveži brave s jedinicama</h2>

                        <div className="mt-5 space-y-4">
                            {jedinice.map((jedinica) => {
                                return (
                                    <div
                                        key={jedinica.id}
                                        className="rounded-3xl border border-[#eadcc8] bg-[#fffaf2] p-4"
                                    >
                                        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8a6a3f]">
                                            {jedinica.objekt.naziv}
                                        </p>

                                        <h3 className="mt-1 text-lg font-bold">
                                            {jedinica.naziv}
                                        </h3>

                                        {aktivneBrave.length === 0 ? (
                                            <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-[#8b7c6c]">
                                                Nema unesenih aktivnih brava.
                                            </p>
                                        ) : (
                                            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                                {aktivneBrave.map((brava) => {
                                                    const poveznica = jedinica.ttlockBrave.find(
                                                        (p) => p.bravaId === brava.id
                                                    );

                                                    const vecPovezana = Boolean(poveznica);
                                                    const jeGlavna = brava.tip === "GLAVNI_ULAZ";

                                                    return (
                                                        <div
                                                            key={brava.id}
                                                            className={`rounded-2xl border p-3 ${
                                                                vecPovezana
                                                                    ? "border-green-300 bg-green-50"
                                                                    : "border-[#eadcc8] bg-white"
                                                            }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm font-bold">
                                                                        {brava.naziv}
                                                                    </p>

                                                                    <p className="mt-1 text-xs text-[#7a6a58]">
                                                                        {brava.objektNaziv || "-"} ·{" "}
                                                                        {brava.tip.replaceAll("_", " ")}
                                                                    </p>

                                                                    {vecPovezana ? (
                                                                        <p className="mt-2 text-xs font-bold text-green-800">
                                                                            Povezano
                                                                            {poveznica?.glavnaZaJedinicu
                                                                                ? " · glavna"
                                                                                : ""}
                                                                        </p>
                                                                    ) : null}
                                                                </div>

                                                                {vecPovezana ? (
                                                                    <form action={ukloniPoveznicu}>
                                                                        <input
                                                                            type="hidden"
                                                                            name="id"
                                                                            value={poveznica?.id || ""}
                                                                        />

                                                                        <button
                                                                            type="submit"
                                                                            title="Makni bravu s jedinice"
                                                                            className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-green-700 bg-green-600 text-sm font-bold text-white hover:border-red-700 hover:bg-red-600"
                                                                        >
                                                                            ✓
                                                                        </button>
                                                                    </form>
                                                                ) : (
                                                                    <form action={poveziBravu}>
                                                                        <input
                                                                            type="hidden"
                                                                            name="jedinicaId"
                                                                            value={jedinica.id}
                                                                        />
                                                                        <input
                                                                            type="hidden"
                                                                            name="bravaId"
                                                                            value={brava.id}
                                                                        />
                                                                        <input
                                                                            type="hidden"
                                                                            name="glavnaZaJedinicu"
                                                                            value={jeGlavna ? "true" : "false"}
                                                                        />

                                                                        <button
                                                                            type="submit"
                                                                            title="Poveži bravu s jedinicom"
                                                                            className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#bca98a] bg-white text-sm font-bold text-[#8a6a3f] hover:bg-[#efe3cf]"
                                                                        />
                                                                    </form>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}