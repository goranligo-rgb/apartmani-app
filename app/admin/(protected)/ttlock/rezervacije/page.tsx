import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function generirajSifruIzTelefona(telefon?: string | null) {
    const brojevi = String(telefon || "").replace(/\D/g, "");

    if (brojevi.length >= 4) {
        return brojevi.slice(-4);
    }

    return String(Math.floor(1000 + Math.random() * 9000));
}

function setTime(date: Date, hour: number, minute: number) {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    return d;
}

function parseTime(value?: string | null) {
    const v = String(value || "").trim();
    const [h, m] = v.split(":").map(Number);

    return {
        hour: Number.isFinite(h) ? h : 16,
        minute: Number.isFinite(m) ? m : 0,
    };
}

function formatDate(value: Date) {
    return value.toLocaleDateString("hr-HR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function formatTime(value: Date) {
    return value.toLocaleTimeString("hr-HR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDateTime(value: Date) {
    return value.toLocaleString("hr-HR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

async function osigurajTtlockSifreZaRezervacije() {
    const rezervacije = await prisma.rezervacija.findMany({
        where: {
            status: {
                in: ["REZERVIRANO", "POTVRDENO", "CEKA_OSTATAK", "PLACENO"],
            },
        },
        include: {
            gost: true,
            jedinica: {
                include: {
                    ttlockBrave: true,
                },
            },
            ttlockSifre: true,
        },
    });

    for (const rezervacija of rezervacije) {
        if (rezervacija.ttlockSifre.length > 0) continue;
        if (rezervacija.jedinica.ttlockBrave.length === 0) continue;

        const sifra = generirajSifruIzTelefona(rezervacija.gost?.telefon);
        const vrijediOd = setTime(rezervacija.datumOd, 16, 0);
        const vrijediDo = setTime(rezervacija.datumDo, 10, 0);

        for (const veza of rezervacija.jedinica.ttlockBrave) {
            await prisma.rezervacijaTtlockSifra.upsert({
                where: {
                    rezervacijaId_bravaId: {
                        rezervacijaId: rezervacija.id,
                        bravaId: veza.bravaId,
                    },
                },
                update: {
                    sifra,
                    vrijediOd,
                    vrijediDo,
                    status: "CEKA",
                    greska: null,
                },
                create: {
                    rezervacijaId: rezervacija.id,
                    bravaId: veza.bravaId,
                    sifra,
                    vrijediOd,
                    vrijediDo,
                    status: "CEKA",
                },
            });
        }
    }
}

async function spremiSifru(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    const sifraRaw = String(formData.get("sifra") || "").trim();
    const ulazVrijeme = String(formData.get("ulazVrijeme") || "16:00");
    const izlazVrijeme = String(formData.get("izlazVrijeme") || "10:00");

    if (!rezervacijaId) return;

    const rezervacija = await prisma.rezervacija.findUnique({
        where: { id: rezervacijaId },
        include: {
            gost: true,
            jedinica: {
                include: {
                    ttlockBrave: true,
                },
            },
        },
    });

    if (!rezervacija) return;

    const sifra =
        sifraRaw.replace(/\D/g, "").slice(0, 4) ||
        generirajSifruIzTelefona(rezervacija.gost?.telefon);

    const ulaz = parseTime(ulazVrijeme);
    const izlaz = parseTime(izlazVrijeme);

    const vrijediOd = setTime(rezervacija.datumOd, ulaz.hour, ulaz.minute);
    const vrijediDo = setTime(rezervacija.datumDo, izlaz.hour, izlaz.minute);

    for (const veza of rezervacija.jedinica.ttlockBrave) {
        await prisma.rezervacijaTtlockSifra.upsert({
            where: {
                rezervacijaId_bravaId: {
                    rezervacijaId: rezervacija.id,
                    bravaId: veza.bravaId,
                },
            },
            update: {
                sifra,
                vrijediOd,
                vrijediDo,
                status: "CEKA",
                greska: null,
            },
            create: {
                rezervacijaId: rezervacija.id,
                bravaId: veza.bravaId,
                sifra,
                vrijediOd,
                vrijediDo,
                status: "CEKA",
            },
        });
    }

    revalidatePath("/admin/ttlock/rezervacije");
}

async function posaljiSifruGostu(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    if (!rezervacijaId) return;

    const rezervacija = await prisma.rezervacija.findUnique({
        where: { id: rezervacijaId },
        include: {
            gost: true,
            jedinica: {
                include: {
                    objekt: true,
                },
            },
            ttlockSifre: {
                include: {
                    brava: true,
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });

    if (!rezervacija?.gost?.email) return;
    if (rezervacija.ttlockSifre.length === 0) return;

    const prva = rezervacija.ttlockSifre[0];

    await resend.emails.send({
        from: process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>",
        to: rezervacija.gost.email,
        subject: `Vaša ulazna šifra - ${rezervacija.jedinica.objekt.naziv}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2f261d">
                <h2>Dobrodošli u Malinska Stay</h2>
                <p>Poštovani ${rezervacija.gost.ime},</p>
                <p>Vaša ulazna šifra je:</p>
                <div style="font-size:34px;font-weight:800;letter-spacing:8px;padding:16px;background:#f7f2e8;border-radius:16px;text-align:center;">
                    ${prva.sifra}
                </div>
                <p>Šifra vrijedi od <strong>${formatDateTime(prva.vrijediOd)}</strong> do <strong>${formatDateTime(prva.vrijediDo)}</strong>.</p>
                <p>Šifra vrijedi za:</p>
                <ul>
                    ${rezervacija.ttlockSifre.map((s) => `<li>${s.brava.naziv}</li>`).join("")}
                </ul>
                <p>Lijep pozdrav,<br/>Malinska Stay</p>
            </div>
        `,
    });

    await prisma.rezervacijaTtlockSifra.updateMany({
        where: {
            rezervacijaId,
        },
        data: {
            poslanaGostu: true,
            poslanaAt: new Date(),
        },
    });

    revalidatePath("/admin/ttlock/rezervacije");
}

async function obrisiSifre(formData: FormData) {
    "use server";

    const rezervacijaId = String(formData.get("rezervacijaId") || "");
    if (!rezervacijaId) return;

    await prisma.rezervacijaTtlockSifra.deleteMany({
        where: { rezervacijaId },
    });

    revalidatePath("/admin/ttlock/rezervacije");
}

export default async function TtlockRezervacijePage() {
    await osigurajTtlockSifreZaRezervacije();

    const rezervacije = await prisma.rezervacija.findMany({
        where: {
            status: {
                in: ["REZERVIRANO", "POTVRDENO", "CEKA_OSTATAK", "PLACENO"],
            },
        },
        include: {
            gost: true,
            jedinica: {
                include: {
                    objekt: true,
                    ttlockBrave: {
                        include: {
                            brava: true,
                        },
                    },
                },
            },
            ttlockSifre: {
                include: {
                    brava: true,
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
        orderBy: {
            datumOd: "asc",
        },
    });

    return (
        <main className="min-h-screen bg-[#f7f2e8] px-4 py-6 text-[#2f261d] md:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8a6a3f]">
                        Malinska Stay
                    </p>

                    <h1 className="mt-2 text-3xl font-bold">
                        TTLock šifre za rezervacije
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm text-[#6f6255]">
                        Šifra se automatski generira iz zadnje 4 znamenke telefona gosta.
                        Ulaz je po defaultu u 16:00, izlaz u 10:00, ali možeš ručno promijeniti.
                    </p>
                </div>

                <div className="space-y-4">
                    {rezervacije.length === 0 ? (
                        <div className="rounded-3xl bg-white p-6 text-sm shadow-sm ring-1 ring-black/5">
                            Nema aktivnih rezervacija.
                        </div>
                    ) : (
                        rezervacije.map((rezervacija) => {
                            const gost = rezervacija.gost
                                ? `${rezervacija.gost.ime} ${rezervacija.gost.prezime || ""}`.trim()
                                : "Gost nije upisan";

                            const imaPovezaneBrave =
                                rezervacija.jedinica.ttlockBrave.length > 0;

                            const prvaSifra = rezervacija.ttlockSifre[0];
                            const sifra =
                                prvaSifra?.sifra ||
                                generirajSifruIzTelefona(rezervacija.gost?.telefon);

                            return (
                                <div
                                    key={rezervacija.id}
                                    className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8a6a3f]">
                                                {rezervacija.jedinica.objekt.naziv}
                                            </p>

                                            <h2 className="mt-1 text-2xl font-bold">
                                                {rezervacija.jedinica.naziv}
                                            </h2>

                                            <div className="mt-2 space-y-1 text-sm text-[#6f6255]">
                                                <p>Gost: {gost}</p>
                                                <p>Telefon: {rezervacija.gost?.telefon || "-"}</p>
                                                <p>
                                                    Termin: {formatDate(rezervacija.datumOd)} -{" "}
                                                    {formatDate(rezervacija.datumDo)}
                                                </p>
                                                <p>Status: {rezervacija.status}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <form action={posaljiSifruGostu}>
                                                <input
                                                    type="hidden"
                                                    name="rezervacijaId"
                                                    value={rezervacija.id}
                                                />

                                                <button
                                                    type="submit"
                                                    disabled={
                                                        !rezervacija.gost?.email ||
                                                        rezervacija.ttlockSifre.length === 0
                                                    }
                                                    className={`rounded-2xl px-5 py-3 text-sm font-bold ${
                                                        rezervacija.gost?.email &&
                                                        rezervacija.ttlockSifre.length > 0
                                                            ? "bg-[#2f261d] text-white hover:bg-[#4a3827]"
                                                            : "bg-gray-200 text-gray-500"
                                                    }`}
                                                >
                                                    Pošalji gostu
                                                </button>
                                            </form>

                                            {rezervacija.ttlockSifre.length > 0 ? (
                                                <form action={obrisiSifre}>
                                                    <input
                                                        type="hidden"
                                                        name="rezervacijaId"
                                                        value={rezervacija.id}
                                                    />

                                                    <button
                                                        type="submit"
                                                        className="rounded-2xl bg-red-100 px-5 py-3 text-sm font-bold text-red-800 hover:bg-red-200"
                                                    >
                                                        Obriši šifru
                                                    </button>
                                                </form>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-2xl bg-[#fffaf2] p-4">
                                            <h3 className="font-bold">Povezane brave jedinice</h3>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {rezervacija.jedinica.ttlockBrave.length === 0 ? (
                                                    <p className="text-sm text-red-700">
                                                        Ova jedinica još nema povezane brave.
                                                    </p>
                                                ) : (
                                                    rezervacija.jedinica.ttlockBrave.map((veza) => (
                                                        <span
                                                            key={veza.id}
                                                            className="rounded-full bg-white px-3 py-2 text-sm font-semibold ring-1 ring-black/5"
                                                        >
                                                            {veza.brava.naziv}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl bg-[#fffaf2] p-4">
                                            <h3 className="font-bold">TTLock pristup</h3>

                                            {!imaPovezaneBrave ? (
                                                <p className="mt-3 text-sm text-red-700">
                                                    Prvo poveži brave s jedinicom.
                                                </p>
                                            ) : (
                                                <form action={spremiSifru} className="mt-3 space-y-3">
                                                    <input
                                                        type="hidden"
                                                        name="rezervacijaId"
                                                        value={rezervacija.id}
                                                    />

                                                    <div className="rounded-2xl bg-white p-4 text-center ring-1 ring-black/5">
                                                        <label className="text-sm text-[#6f6255]">
                                                            Šifra gosta
                                                        </label>
                                                        <input
                                                            name="sifra"
                                                            defaultValue={sifra}
                                                            maxLength={4}
                                                            className="mt-2 w-full rounded-xl border border-[#ddd0bd] px-4 py-3 text-center text-3xl font-black tracking-[0.2em]"
                                                        />
                                                    </div>

                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <div>
                                                            <label className="text-sm font-bold">
                                                                Ulaz
                                                            </label>
                                                            <p className="mt-1 text-xs text-[#6f6255]">
                                                                {formatDate(rezervacija.datumOd)}
                                                            </p>
                                                            <input
                                                                name="ulazVrijeme"
                                                                type="time"
                                                                defaultValue={
                                                                    prvaSifra
                                                                        ? formatTime(prvaSifra.vrijediOd)
                                                                        : "16:00"
                                                                }
                                                                className="mt-1 w-full rounded-xl border border-[#ddd0bd] bg-white px-4 py-3 text-sm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-sm font-bold">
                                                                Izlaz
                                                            </label>
                                                            <p className="mt-1 text-xs text-[#6f6255]">
                                                                {formatDate(rezervacija.datumDo)}
                                                            </p>
                                                            <input
                                                                name="izlazVrijeme"
                                                                type="time"
                                                                defaultValue={
                                                                    prvaSifra
                                                                        ? formatTime(prvaSifra.vrijediDo)
                                                                        : "10:00"
                                                                }
                                                                className="mt-1 w-full rounded-xl border border-[#ddd0bd] bg-white px-4 py-3 text-sm"
                                                            />
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="submit"
                                                        className="w-full rounded-2xl bg-[#8a6a3f] px-5 py-3 text-sm font-bold text-white hover:bg-[#6f5430]"
                                                    >
                                                        Spremi šifru i vrijeme
                                                    </button>
                                                </form>
                                            )}

                                            {rezervacija.ttlockSifre.length > 0 ? (
                                                <div className="mt-4 space-y-2">
                                                    {rezervacija.ttlockSifre.map((s) => (
                                                        <div
                                                            key={s.id}
                                                            className="rounded-2xl bg-white p-3 text-sm ring-1 ring-black/5"
                                                        >
                                                            <p className="font-bold">{s.brava.naziv}</p>
                                                            <p className="text-xs text-[#6f6255]">
                                                                Vrijedi od {formatDateTime(s.vrijediOd)} do{" "}
                                                                {formatDateTime(s.vrijediDo)}
                                                            </p>
                                                            <p className="mt-1 text-xs font-bold text-[#8a6a3f]">
                                                                Status: {s.status}
                                                            </p>
                                                            {s.poslanaGostu ? (
                                                                <p className="mt-1 text-xs font-bold text-green-700">
                                                                    Poslano gostu{" "}
                                                                    {s.poslanaAt
                                                                        ? formatDateTime(s.poslanaAt)
                                                                        : ""}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </main>
    );
}