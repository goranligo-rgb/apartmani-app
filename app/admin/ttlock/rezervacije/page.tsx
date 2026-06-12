import { prisma } from "@/lib/prisma";
import { zagrebWallClockToInstant, formatZagreb } from "@/lib/dates";
import { obrisiTtlockSifru } from "@/lib/ttlock";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import {
  dohvatiPrijevode,
  odaberiJezikMaila,
  formatDateTimeZaMail,
} from "@/lib/mailovi";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);
const BCC_EMAIL = process.env.MAIL_BCC || "goran@malinska-stay.hr";

function generirajSifruIzTelefona(telefon?: string | null) {
    const brojevi = String(telefon || "").replace(/\D/g, "");

    if (brojevi.length >= 4) {
        return brojevi.slice(-4);
    }

    return String(Math.floor(1000 + Math.random() * 9000));
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
    // Europe/Zagreb: vrijediOd/Do je sada ispravan instant; bez timeZone bi se
    // na UTC serveru prikazalo -2h (npr. "14:00" umjesto "16:00").
    return formatZagreb(value, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// TTLock prozor (vrijediOd/Do) UVIJEK u Europe/Zagreb — mora se slagati s
// bravom. (poslanaAt log = Blok B, koristi formatDateTime ispod.)
function formatDateTimeTtlock(value: Date) {
    return formatZagreb(value, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Logovi (poslanaAt) — pravi žig. Europe/Zagreb da pokaže stvarni sat.
function formatDateTime(value: Date) {
    return formatZagreb(value, {
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
        // Hrvatski zidni sat (16:00/10:00) → ispravan UTC instant (DST-aware).
        const vrijediOd = zagrebWallClockToInstant(rezervacija.datumOd, 16, 0);
        const vrijediDo = zagrebWallClockToInstant(rezervacija.datumDo, 10, 0);

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

    // Sat iz forme je hrvatski zidni sat → ispravan UTC instant (DST-aware).
    const vrijediOd = zagrebWallClockToInstant(rezervacija.datumOd, ulaz.hour, ulaz.minute);
    const vrijediDo = zagrebWallClockToInstant(rezervacija.datumDo, izlaz.hour, izlaz.minute);

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
    const jezik = odaberiJezikMaila(rezervacija.gost.jezik);
    const t = dohvatiPrijevode(jezik).ttlockSifra;

    // House Art (vrsta=KUCA) ima samo 1 jedinicu istog naziva kao objekt —
    // preskačemo naziv jedinice u naslovu da se ne ponavlja "House Art, House Art".
    // Multi-unit objekti (APARTMAN/STAN, npr. "Eva 1") dobivaju oba.
    const jedinicaNazivZaNaslov =
        rezervacija.jedinica.vrsta === "KUCA"
            ? undefined
            : rezervacija.jedinica.naziv;

    await resend.emails.send({
        from: process.env.MAIL_FROM || "Malinska Stay <rezervacije@malinska-stay.hr>",
        to: rezervacija.gost.email,
        bcc: [BCC_EMAIL],
        subject: t.subject(rezervacija.jedinica.objekt.naziv),
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2f261d">
                <h2>${t.naslov(rezervacija.jedinica.objekt.naziv, jedinicaNazivZaNaslov)}</h2>
                <p>${t.pozdrav(rezervacija.gost.ime || "")}</p>
                <p>${t.sifraJe}</p>
                <div style="font-size:34px;font-weight:800;letter-spacing:8px;padding:16px;background:#f7f2e8;border-radius:16px;text-align:center;">
                    ${prva.sifra}
                </div>
                <p>${t.sifraVrijedi(formatDateTimeZaMail(prva.vrijediOd, jezik), formatDateTimeZaMail(prva.vrijediDo, jezik))}</p>
                <p>${t.vrijediZa}</p>
                <ul>
                    ${rezervacija.ttlockSifre.map((s) => `<li>${s.brava.naziv}</li>`).join("")}
                </ul>
                <p>${t.zavrsetak}</p>
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

    // Orphan fix: prije brisanja iz baze makni šifru i s FIZIČKE brave. Bez
    // ovoga bi zapis nestao iz baze, a kod ostao aktivan na bravi (gost bi i
    // dalje mogao ući). Učitamo lockId + keyboardPwdId za svaki red.
    const sifre = await prisma.rezervacijaTtlockSifra.findMany({
        where: { rezervacijaId },
        include: { brava: true },
    });

    for (const s of sifre) {
        // Bez keyboardPwdId-a (nikad uspješno poslana) nema što obrisati s brave.
        if (!s.ttlockKeyboardPwdId) continue;
        try {
            await obrisiTtlockSifru({
                lockId: s.brava.lockId,
                keyboardPwdId: s.ttlockKeyboardPwdId,
            });
        } catch (err: any) {
            // Greška na bravi NE smije blokirati brisanje iz baze (npr. šifra
            // već ne postoji na bravi). Logiramo i nastavljamo.
            console.error(
                `[ttlock-orphan] brisanje s brave nije uspjelo (sifra ${s.id}):`,
                err?.message
            );
        }
    }

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
                                                                Vrijedi od {formatDateTimeTtlock(s.vrijediOd)} do{" "}
                                                                {formatDateTimeTtlock(s.vrijediDo)}
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