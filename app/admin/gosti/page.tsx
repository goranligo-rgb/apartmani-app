import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  drzava?: string;
  oznaka?: string;
}>;

const UI_COLORS = {
  slobodno: "#ede9fe",
  slobodnoBorder: "#ddd6fe",
  zauzeto: "#fee2e2",
  zauzetoBorder: "#fecaca",
  odabrano: "#8f7df0",
  odabranoBorder: "#6f5ce0",
  gold: "#c79a57",
  goldSoft: "rgba(199, 154, 87, 0.18)",
  dangerText: "#991b1b",
  purpleText: "#5b21b6",
  dark: "#0b252b",
};

const OZNAKE_GOSTA = [
  "VIP",
  "SUPER_GOST",
  "POVRATNI_GOST",
  "ZAHTJEVAN",
  "NEUREDAN",
  "KASNI_S_PLACANJEM",
  "PROBLEMATICAN",
];

function parseOznake(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatDate(value?: Date | null) {
  if (!value) return "-";
  return value.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function money(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function isProblemOznaka(oznaka: string) {
  return (
    oznaka === "NEUREDAN" ||
    oznaka === "PROBLEMATICAN" ||
    oznaka === "KASNI_S_PLACANJEM" ||
    oznaka === "ZAHTJEVAN"
  );
}

export default async function AdminGostiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const q = String(sp.q || "").trim().toLowerCase();
  const drzavaFilter = String(sp.drzava || "").trim();
  const oznakaFilter = String(sp.oznaka || "").trim();

  const gosti = await prisma.gost.findMany({
    include: {
      rezervacije: {
        include: {
          jedinica: {
            include: {
              objekt: true,
            },
          },
        },
        orderBy: { datumOd: "desc" },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const sveDrzave = Array.from(
    new Set(gosti.map((g) => g.drzava).filter(Boolean).map(String))
  ).sort((a, b) => a.localeCompare(b, "hr"));

  const filtrirani = gosti.filter((g) => {
    const oznake = parseOznake(g.oznake);

    const text = [
      g.ime,
      g.prezime,
      g.email,
      g.telefon,
      g.adresa,
      g.grad,
      g.drzava,
      g.napomena,
      g.oznake,
      ...g.rezervacije.map((r) => r.jedinica?.naziv),
      ...g.rezervacije.map((r) => r.jedinica?.objekt?.naziv),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!q || text.includes(q)) &&
      (!drzavaFilter || g.drzava === drzavaFilter) &&
      (!oznakaFilter || oznake.includes(oznakaFilter))
    );
  });

  const statistikaDrzava = sveDrzave
    .map((drzava) => ({
      drzava,
      broj: gosti.filter((g) => g.drzava === drzava).length,
    }))
    .sort((a, b) => b.broj - a.broj)
    .slice(0, 6);

  const ukupnoGostiju = gosti.length;
  const ukupnoRezervacija = gosti.reduce(
    (sum, g) => sum + g.rezervacije.length,
    0
  );
  const povratni = gosti.filter((g) => g.rezervacije.length > 1).length;
  const problematicni = gosti.filter((g) =>
    parseOznake(g.oznake).some(isProblemOznaka)
  ).length;

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "radial-gradient(circle at top left, rgba(143,125,240,0.16), transparent 34%), linear-gradient(135deg, #f8fafc 0%, #f3f0ff 45%, #fff7ed 100%)",
        color: UI_COLORS.dark,
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div
          className="mb-6 border p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
          style={{
            background: "rgba(255,255,255,0.92)",
            borderColor: UI_COLORS.slobodnoBorder,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin"
                className="text-sm font-black no-underline"
                style={{ color: UI_COLORS.purpleText }}
              >
                ← Admin
              </Link>

              <h1 className="mt-4 text-4xl font-black tracking-tight">
                Gosti / arhiva gostiju
              </h1>

              <p className="mt-2 max-w-3xl text-slate-600">
                Pregled gostiju, kontakata, adresa, oznaka i povijesti boravaka.
              </p>
            </div>

            <Link
              href="/admin/rezervacije/nova"
              className="border px-4 py-3 text-sm font-black no-underline"
              style={{
                backgroundColor: UI_COLORS.goldSoft,
                borderColor: UI_COLORS.gold,
                color: UI_COLORS.dark,
              }}
            >
              + Nova rezervacija
            </Link>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <Stat title="Ukupno gostiju" value={ukupnoGostiju} />
          <Stat title="Rezervacija" value={ukupnoRezervacija} />
          <Stat title="Povratni gosti" value={povratni} purple />
          <Stat title="Pažnja" value={problematicni} danger />
        </section>

        {statistikaDrzava.length > 0 && (
          <section
            className="mb-6 border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)]"
            style={{
              background: "rgba(255,255,255,0.86)",
              borderColor: "#e2e8f0",
            }}
          >
            <h2 className="mb-4 text-xl font-black">Top države</h2>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {statistikaDrzava.map((item) => (
                <div
                  key={item.drzava}
                  className="border p-3"
                  style={{
                    background: UI_COLORS.slobodno,
                    borderColor: UI_COLORS.slobodnoBorder,
                  }}
                >
                  <div
                    className="text-xs font-black uppercase tracking-[0.14em]"
                    style={{ color: UI_COLORS.purpleText }}
                  >
                    {item.drzava}
                  </div>
                  <div className="mt-1 text-2xl font-black">{item.broj}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          className="mb-6 border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)]"
          style={{
            background: "rgba(255,255,255,0.9)",
            borderColor: "#e2e8f0",
          }}
        >
          <form className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Pretraži ime, prezime, email, telefon, adresu, grad, napomenu..."
              className="w-full border bg-white px-4 py-3 outline-none"
              style={{ borderColor: "#dbe3ee", color: UI_COLORS.dark }}
            />

            <select
              name="drzava"
              defaultValue={drzavaFilter}
              className="w-full border bg-white px-4 py-3 outline-none"
              style={{ borderColor: "#dbe3ee", color: UI_COLORS.dark }}
            >
              <option value="">Sve države</option>
              {sveDrzave.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              name="oznaka"
              defaultValue={oznakaFilter}
              className="w-full border bg-white px-4 py-3 outline-none"
              style={{ borderColor: "#dbe3ee", color: UI_COLORS.dark }}
            >
              <option value="">Sve oznake</option>
              {OZNAKE_GOSTA.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <button
              className="border px-5 py-3 font-black"
              style={{
                backgroundColor: UI_COLORS.odabrano,
                borderColor: UI_COLORS.odabranoBorder,
                color: "white",
              }}
            >
              Filtriraj
            </button>
          </form>

          {(q || drzavaFilter || oznakaFilter) && (
            <div className="mt-3">
              <Link
                href="/admin/gosti"
                className="text-sm font-black no-underline"
                style={{ color: UI_COLORS.purpleText }}
              >
                Očisti filtere
              </Link>
            </div>
          )}
        </section>

        <section className="grid gap-4">
          {filtrirani.length === 0 ? (
            <div
              className="border p-8 text-center text-slate-500"
              style={{
                background: "white",
                borderColor: "#e2e8f0",
              }}
            >
              Nema gostiju za odabrani filter.
            </div>
          ) : (
            filtrirani.map((gost) => {
              const oznake = parseOznake(gost.oznake);
              const zadnja = gost.rezervacije[0];
              const imaProblem = oznake.some(isProblemOznaka);
              const jePovratni = gost.rezervacije.length > 1;

              const ukupnoPotroseno = gost.rezervacije.reduce((sum, r) => {
                return (
                  sum +
                  Number(
                    r.dogovoreniIznos || r.iznosUkupno || r.iznosOsnovni || 0
                  )
                );
              }, 0);

              return (
                <article
                  key={gost.id}
                  className="border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)]"
                  style={{
                    background: imaProblem ? UI_COLORS.zauzeto : "white",
                    borderColor: imaProblem
                      ? UI_COLORS.zauzetoBorder
                      : "#e2e8f0",
                  }}
                >
                  <div className="grid gap-5 xl:grid-cols-[1.2fr_0.9fr_0.9fr_170px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black">
                          {gost.ime} {gost.prezime || ""}
                        </h2>

                        {jePovratni && (
                          <Badge
                            label="POVRATNI_GOST"
                            bg={UI_COLORS.slobodno}
                            border={UI_COLORS.slobodnoBorder}
                            color={UI_COLORS.purpleText}
                          />
                        )}

                        {imaProblem && (
                          <Badge
                            label="PAŽNJA"
                            bg="#fff"
                            border={UI_COLORS.zauzetoBorder}
                            color={UI_COLORS.dangerText}
                          />
                        )}
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        {gost.email || "-"} · {gost.telefon || "-"}
                      </div>

                      <div className="mt-3 grid gap-1 text-sm text-slate-700">
                        <div>
                          <b>Adresa:</b> {gost.adresa || "-"}
                        </div>
                        <div>
                          <b>Grad:</b> {gost.grad || "-"}
                        </div>
                        <div>
                          <b>Država:</b> {gost.drzava || "-"}
                        </div>
                      </div>

                      {oznake.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {oznake.map((oznaka) => (
                            <Badge
                              key={oznaka}
                              label={oznaka}
                              bg={
                                isProblemOznaka(oznaka)
                                  ? "#fff"
                                  : UI_COLORS.goldSoft
                              }
                              border={
                                isProblemOznaka(oznaka)
                                  ? UI_COLORS.zauzetoBorder
                                  : UI_COLORS.gold
                              }
                              color={
                                isProblemOznaka(oznaka)
                                  ? UI_COLORS.dangerText
                                  : UI_COLORS.dark
                              }
                            />
                          ))}
                        </div>
                      )}

                      {gost.napomena && (
                        <div
                          className="mt-3 border p-3 text-sm"
                          style={{
                            background: UI_COLORS.goldSoft,
                            borderColor: UI_COLORS.gold,
                            color: UI_COLORS.dark,
                          }}
                        >
                          <div
                            className="mb-1 text-xs font-black uppercase tracking-[0.14em]"
                            style={{ color: UI_COLORS.dark }}
                          >
                            Napomena gosta
                          </div>
                          {gost.napomena}
                        </div>
                      )}
                    </div>

                    <Box title="Statistika">
                      <Row label="Broj rezervacija" value={gost.rezervacije.length} />
                      <Row label="Ukupno" value={money(ukupnoPotroseno)} />
                      <Row label="Prvi unos" value={formatDate(gost.createdAt)} />
                      <Row label="Zadnja izmjena" value={formatDate(gost.updatedAt)} />
                    </Box>

                    <Box title="Zadnji boravak">
                      {zadnja ? (
                        <>
                          <Row
                            label="Termin"
                            value={`${formatDate(zadnja.datumOd)} – ${formatDate(
                              zadnja.datumDo
                            )}`}
                          />
                          <Row label="Objekt" value={zadnja.jedinica.objekt.naziv} />
                          <Row label="Jedinica" value={zadnja.jedinica.naziv} />
                          <Row label="Status" value={zadnja.status} />
                          <Row
                            label="Iznos"
                            value={money(
                              zadnja.dogovoreniIznos ||
                                zadnja.iznosUkupno ||
                                zadnja.iznosOsnovni
                            )}
                          />
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">Nema rezervacija.</p>
                      )}
                    </Box>

                    <div className="flex flex-col gap-2">
                      {zadnja && (
                        <Link
                          href={`/admin/rezervacije/${zadnja.id}`}
                          className="border px-4 py-3 text-center text-sm font-black no-underline"
                          style={{
                            backgroundColor: UI_COLORS.goldSoft,
                            borderColor: UI_COLORS.gold,
                            color: UI_COLORS.dark,
                          }}
                        >
                          Otvori zadnju
                        </Link>
                      )}

                      <Link
                        href={`/admin/gosti/${gost.id}`}
                        className="border px-4 py-3 text-center text-sm font-black no-underline"
                        style={{
                          backgroundColor: UI_COLORS.slobodno,
                          borderColor: UI_COLORS.slobodnoBorder,
                          color: UI_COLORS.purpleText,
                        }}
                      >
                        Detalj gosta
                      </Link>

                      <Link
                        href="/admin/rezervacije/nova"
                        className="border px-4 py-3 text-center text-sm font-black no-underline"
                        style={{
                          backgroundColor: UI_COLORS.odabrano,
                          borderColor: UI_COLORS.odabranoBorder,
                          color: "white",
                        }}
                      >
                        Nova rezervacija
                      </Link>
                    </div>
                  </div>

                  {gost.rezervacije.length > 1 && (
                    <details className="mt-4 border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                      <summary
                        className="cursor-pointer text-sm font-black"
                        style={{ color: UI_COLORS.purpleText }}
                      >
                        Prikaži sve boravke ({gost.rezervacije.length})
                      </summary>

                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b text-left text-slate-500">
                              <th className="py-2 pr-3">Termin</th>
                              <th className="py-2 pr-3">Objekt</th>
                              <th className="py-2 pr-3">Jedinica</th>
                              <th className="py-2 pr-3">Status</th>
                              <th className="py-2 pr-3 text-right">Iznos</th>
                              <th className="py-2 pr-3 text-right">Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gost.rezervacije.map((r) => (
                              <tr key={r.id} className="border-b text-slate-700">
                                <td className="py-2 pr-3">
                                  {formatDate(r.datumOd)} – {formatDate(r.datumDo)}
                                </td>
                                <td className="py-2 pr-3">{r.jedinica.objekt.naziv}</td>
                                <td className="py-2 pr-3">{r.jedinica.naziv}</td>
                                <td className="py-2 pr-3">{r.status}</td>
                                <td className="py-2 pr-3 text-right">
                                  {money(
                                    r.dogovoreniIznos ||
                                      r.iznosUkupno ||
                                      r.iznosOsnovni
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right">
                                  <Link
                                    href={`/admin/rezervacije/${r.id}`}
                                    style={{ color: UI_COLORS.purpleText }}
                                  >
                                    Otvori →
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
  purple,
  danger,
}: {
  title: string;
  value: number;
  purple?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className="border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)]"
      style={{
        background: danger
          ? UI_COLORS.zauzeto
          : purple
          ? UI_COLORS.slobodno
          : "white",
        borderColor: danger
          ? UI_COLORS.zauzetoBorder
          : purple
          ? UI_COLORS.slobodnoBorder
          : "#e2e8f0",
      }}
    >
      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div
        className="mt-2 text-3xl font-black"
        style={{
          color: danger
            ? UI_COLORS.dangerText
            : purple
            ? UI_COLORS.purpleText
            : UI_COLORS.dark,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Box({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border p-4"
      style={{
        background: "#f8fafc",
        borderColor: "#e2e8f0",
      }}
    >
      <div
        className="mb-3 text-xs font-black uppercase tracking-[0.14em]"
        style={{ color: UI_COLORS.purpleText }}
      >
        {title}
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Badge({
  label,
  bg,
  border,
  color,
}: {
  label: string;
  bg: string;
  border: string;
  color: string;
}) {
  return (
    <span
      className="inline-block border px-2 py-1 text-[10px] font-black"
      style={{
        backgroundColor: bg,
        borderColor: border,
        color,
      }}
    >
      {label}
    </span>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-200 pb-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-black" style={{ color: UI_COLORS.dark }}>
        {value === null || value === undefined || value === "" ? "-" : value}
      </span>
    </div>
  );
}