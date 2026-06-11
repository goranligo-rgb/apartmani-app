import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

type PorukaSDetaljima = Prisma.WhatsappPorukaGetPayload<{
  include: {
    rezervacija: {
      include: { gost: true; jedinica: { include: { objekt: true } } };
    };
  };
}>;

// Ključ za grupiranje po danu u Europe/Zagreb (en-CA daje YYYY-MM-DD) —
// da grupa i prikazani dan budu konzistentni i preko ponoći (UTC vs Zg).
function dayKey(d: Date): string {
  return formatZagreb(d, {
    locale: "en-CA",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function dayLabel(d: Date): string {
  return formatZagreb(d, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function timeLabel(d: Date): string {
  // poslanoAt je pravi žig; Europe/Zagreb pokaže stvarni sat slanja (ne UTC).
  return formatZagreb(d, { hour: "2-digit", minute: "2-digit" });
}

export default async function WhatsappPregledPage() {
  // Tablica WhatsappPoruka se kreira ručnim SQL-om u Supabase tek prije deploya.
  // Dok ne postoji, query baca — graceful fallback na praznu listu.
  let poruke: PorukaSDetaljima[] = [];
  try {
    poruke = await prisma.whatsappPoruka.findMany({
      orderBy: { poslanoAt: "desc" },
      take: 500,
      include: {
        rezervacija: {
          include: {
            gost: true,
            jedinica: { include: { objekt: true } },
          },
        },
      },
    });
  } catch {
    poruke = [];
  }

  // Grupiranje po danu (poslanoAt), najnoviji dan gore.
  const grupe = new Map<string, typeof poruke>();
  for (const p of poruke) {
    const k = dayKey(p.poslanoAt);
    if (!grupe.has(k)) grupe.set(k, []);
    grupe.get(k)!.push(p);
  }

  const ukupnoGreske = poruke.filter((p) => p.status === "GRESKA").length;

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 48%, #eadfce 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl text-[#2e2923]">
        <div className="mb-6 border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>

          <h1 className="mt-4 text-4xl font-black">WhatsApp poruke gostima</h1>
          <p className="mt-2 text-[#6f665a]">
            Povijest automatskih check-in poruka (Twilio WhatsApp). Posljednjih{" "}
            {poruke.length} poruka.
            {ukupnoGreske > 0 ? (
              <span className="ml-2 font-black text-red-700">
                {ukupnoGreske} s greškom
              </span>
            ) : null}
          </p>
        </div>

        {poruke.length === 0 ? (
          <div className="border border-white/80 bg-white p-6 text-[#6f665a] shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
            Još nema poslanih WhatsApp poruka.
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grupe.entries()).map(([k, dnevne]) => (
              <div
                key={k}
                className="border border-white/80 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.08)]"
              >
                <div className="border-b border-[#e2d8c8] bg-[#f8f3ea] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#7a5a22]">
                  {dayLabel(dnevne[0].poslanoAt)} · {dnevne.length}
                </div>

                <div className="divide-y divide-[#eee3d4]">
                  {dnevne.map((p) => {
                    const greska = p.status === "GRESKA";
                    const ime =
                      `${p.rezervacija?.gost?.ime || ""} ${
                        p.rezervacija?.gost?.prezime || ""
                      }`.trim() || "Gost";
                    const objekt = p.rezervacija?.jedinica
                      ? `${p.rezervacija.jedinica.objekt.naziv} · ${p.rezervacija.jedinica.naziv}`
                      : "-";

                    return (
                      <details key={p.id} className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-[#fcfaf6]">
                          <span className="w-14 shrink-0 font-mono text-sm text-[#6f665a]">
                            {timeLabel(p.poslanoAt)}
                          </span>
                          <span className="flex-1 font-black text-[#2e2923]">
                            {ime}
                            <span className="ml-2 font-normal text-xs text-[#6f665a]">
                              {objekt}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 border px-2 py-1 text-xs font-black ${
                              greska
                                ? "border-red-300 bg-red-50 text-red-700"
                                : "border-emerald-300 bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </summary>

                        <div className="border-t border-[#eee3d4] bg-[#fcfaf6] px-5 py-4 text-sm">
                          <div className="mb-2 grid grid-cols-1 gap-1 md:grid-cols-2">
                            <div>
                              <span className="font-black">Primatelj:</span>{" "}
                              {p.primatelj}
                            </div>
                            <div>
                              <span className="font-black">Twilio SID:</span>{" "}
                              {p.twilioSid || "-"}
                            </div>
                            <div>
                              <span className="font-black">Rezervacija:</span>{" "}
                              {p.rezervacija ? (
                                <Link
                                  href={`/admin/rezervacije/${p.rezervacijaId}`}
                                  className="cursor-pointer text-[#9b6b12] hover:text-[#2e2923]"
                                >
                                  otvori
                                </Link>
                              ) : (
                                "-"
                              )}
                            </div>
                            <div>
                              <span className="font-black">Template:</span>{" "}
                              {p.templateSid || "-"}
                            </div>
                          </div>

                          {greska && p.greska ? (
                            <div className="mb-3 border border-red-300 bg-red-50 px-3 py-2 font-black text-red-700">
                              Greška: {p.greska}
                            </div>
                          ) : null}

                          <div className="mb-1 font-black">Tekst poruke:</div>
                          <pre className="whitespace-pre-wrap break-words border border-[#e2d8c8] bg-white p-3 font-sans text-[#2e2923]">
                            {p.tekstPregled}
                          </pre>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
