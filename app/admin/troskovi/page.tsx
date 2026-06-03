import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";
import { startOfTodayInZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ mjesec?: string; objektId?: string }>;

const AUTO_KAT = ["CISCENJE", "POSTELJINA", "BAZEN", "STUBISTE"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function money(v?: number | null) {
  return `${Number(v || 0).toFixed(2).replace(".", ",")} €`;
}

// Datumi se spremaju/čitaju kao UTC ponoć (konzistentno s generatorom) → UTC getteri.
function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatDatum(d: Date) {
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}.`;
}

function parseDatum(raw: FormDataEntryValue | null): Date | null {
  const m = String(raw ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

function parseNum(raw: FormDataEntryValue | null): number {
  const n = parseFloat(String(raw ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function pomakniMjesec(mjesec: string, delta: number) {
  const [y, m] = mjesec.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function mjesecLabel(mjesec: string) {
  const [y, m] = mjesec.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("hr-HR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function katLabel(k: string) {
  if (k === "CISCENJE") return "Završno čišćenje";
  if (k === "POSTELJINA") return "Promjena posteljine";
  if (k === "BAZEN") return "Bazen Marty";
  if (k === "STUBISTE") return "Stubište Eva";
  return k;
}

function buildUrl(mjesec: string, objektId: string) {
  const q = new URLSearchParams();
  if (mjesec) q.set("mjesec", mjesec);
  if (objektId) q.set("objektId", objektId);
  const s = q.toString();
  return s ? `/admin/troskovi?${s}` : "/admin/troskovi";
}

async function dohvatiPostavke() {
  const p = await prisma.ciscenjeMailPostavke.findFirst();
  if (p) return p;
  return prisma.ciscenjeMailPostavke.create({ data: {} });
}

// ── Server actions ───────────────────────────────────────────────

async function dodajRubeninu(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");
  const datum = parseDatum(formData.get("datum"));
  const kg = parseNum(formData.get("kg"));
  const opis = String(formData.get("opis") || "").trim() || null;

  if (datum) {
    const postavke = await dohvatiPostavke();
    const stopa = postavke.rubeninaCijenaPoKg ?? 0;
    await prisma.trosak.create({
      data: {
        datum,
        kategorija: "RUBENINA",
        izvor: "RUCNO",
        kolicina: kg,
        jedinicnaCijena: stopa,
        iznos: kg * stopa,
        opis,
      },
    });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function dodajGeneralno(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");
  const datum = parseDatum(formData.get("datum"));
  const sati = parseNum(formData.get("sati"));
  const opis = String(formData.get("opis") || "").trim() || null;

  if (datum) {
    const postavke = await dohvatiPostavke();
    const stopa = postavke.generalnoCijenaPoSatu ?? 0;
    await prisma.trosak.create({
      data: {
        datum,
        kategorija: "GENERALNO",
        izvor: "RUCNO",
        kolicina: sati,
        jedinicnaCijena: stopa,
        iznos: sati * stopa,
        opis,
      },
    });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function dodajIzvanredno(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");
  const datum = parseDatum(formData.get("datum"));
  const iznos = parseNum(formData.get("iznos"));
  const opis = String(formData.get("opis") || "").trim() || null;

  if (datum) {
    await prisma.trosak.create({
      data: {
        datum,
        kategorija: "IZVANREDNO",
        izvor: "RUCNO",
        iznos,
        opis,
      },
    });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function urediRucniTrosak(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = String(formData.get("id") || "");
  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");
  const datum = parseDatum(formData.get("datum"));
  const opis = String(formData.get("opis") || "").trim() || null;

  const t = await prisma.trosak.findUnique({ where: { id } });
  if (t && t.izvor === "RUCNO") {
    const data: Record<string, unknown> = { opis };
    if (datum) data.datum = datum;

    if (t.kategorija === "RUBENINA" || t.kategorija === "GENERALNO") {
      const kol = parseNum(formData.get("kolicina"));
      const postavke = await dohvatiPostavke();
      const stopa =
        t.kategorija === "RUBENINA"
          ? postavke.rubeninaCijenaPoKg ?? 0
          : postavke.generalnoCijenaPoSatu ?? 0;
      data.kolicina = kol;
      data.jedinicnaCijena = stopa;
      data.iznos = kol * stopa;
    } else {
      data.iznos = parseNum(formData.get("iznos"));
    }

    await prisma.trosak.update({ where: { id }, data });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function obrisiRucniTrosak(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = String(formData.get("id") || "");
  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");

  const t = await prisma.trosak.findUnique({ where: { id } });
  if (t?.izvor === "RUCNO") {
    await prisma.trosak.delete({ where: { id } });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function storniraTrosak(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = String(formData.get("id") || "");
  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");
  const razlog = String(formData.get("razlog") || "").trim().slice(0, 200) || null;

  const t = await prisma.trosak.findUnique({ where: { id } });
  if (t?.izvor === "AUTO") {
    await prisma.trosak.update({
      where: { id },
      data: { storniran: true, stornoRazlog: razlog, stornoAt: new Date() },
    });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

async function ponistiStorno(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = String(formData.get("id") || "");
  const mjesec = String(formData.get("mjesec") || "");
  const objektId = String(formData.get("objektId") || "");

  const t = await prisma.trosak.findUnique({ where: { id } });
  if (t?.izvor === "AUTO") {
    await prisma.trosak.update({
      where: { id },
      data: { storniran: false, stornoRazlog: null, stornoAt: null },
    });
  }

  revalidatePath("/admin/troskovi");
  redirect(buildUrl(mjesec, objektId));
}

// ── UI ───────────────────────────────────────────────────────────

const card =
  "border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]";
const inputCls =
  "border border-[#d8c8aa] bg-[#fcfaf6] px-2 py-1 text-[#2e2923]";
const btn =
  "cursor-pointer border border-[#caa870] bg-[#c79a57] px-4 py-1.5 text-sm font-black text-white transition hover:brightness-95";
const btnOutline =
  "cursor-pointer border border-[#d8c8aa] bg-white px-3 py-1.5 text-sm font-black text-[#7a5a22] transition hover:bg-[#f8f3ea]";
const th =
  "border-b border-[#e2d8c8] p-2 text-left text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]";
const thR = `${th} text-right`;

export default async function TroskoviPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const danasZg = startOfTodayInZagreb();
  const tekuciMjesec = `${danasZg.getUTCFullYear()}-${pad(danasZg.getUTCMonth() + 1)}`;
  const danasIso = isoDate(danasZg);

  const mjesec = /^\d{4}-\d{2}$/.test(sp.mjesec ?? "")
    ? (sp.mjesec as string)
    : tekuciMjesec;
  const objektId = sp.objektId || "";

  const [y, m] = mjesec.split("-").map(Number);
  const od = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const doMj = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));

  const objekti = await prisma.objekt.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const sviTroskovi = await prisma.trosak.findMany({
    where: { datum: { gte: od, lt: doMj } },
    include: { jedinica: true },
    orderBy: { datum: "desc" },
  });

  const auto = sviTroskovi.filter(
    (t) =>
      AUTO_KAT.includes(t.kategorija) && (!objektId || t.objektId === objektId)
  );
  const rubenina = sviTroskovi.filter((t) => t.kategorija === "RUBENINA");
  const generalno = sviTroskovi.filter((t) => t.kategorija === "GENERALNO");
  const izvanredno = sviTroskovi.filter((t) => t.kategorija === "IZVANREDNO");

  const zbroj = (arr: typeof sviTroskovi) =>
    arr.reduce((s, t) => s + (t.storniran ? 0 : t.iznos), 0);

  const sumAuto = zbroj(auto);
  const sumRub = zbroj(rubenina);
  const sumGen = zbroj(generalno);
  const sumIzv = zbroj(izvanredno);
  const ukupno = sumAuto + sumRub + sumGen + sumIzv;

  const hiddenFilteri = (
    <>
      <input type="hidden" name="mjesec" value={mjesec} />
      <input type="hidden" name="objektId" value={objektId} />
    </>
  );

  function jedLabel(t: (typeof sviTroskovi)[number]) {
    if (t.kategorija === "BAZEN") return "Bazen Marty";
    if (t.kategorija === "STUBISTE") return "Stubište Eva";
    return t.jedinica?.naziv ?? "-";
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 48%, #eadfce 100%)",
      }}
    >
      <div className="mx-auto max-w-4xl text-[#2e2923]">
        {/* Header */}
        <div className={`mb-6 ${card}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                href="/admin"
                className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
              >
                ← Admin
              </Link>
              <h1 className="mt-3 text-4xl font-black">Troškovi čišćenja</h1>
            </div>
            <div className="text-right">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
                Ukupno mjesec
              </div>
              <div className="text-2xl font-black">{money(ukupno)}</div>
            </div>
          </div>

          {/* Mjesec nav */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={buildUrl(pomakniMjesec(mjesec, -1), objektId)}
                className={btnOutline}
              >
                ◀
              </Link>
              <span className="min-w-[140px] text-center font-black capitalize">
                {mjesecLabel(mjesec)}
              </span>
              <Link
                href={buildUrl(pomakniMjesec(mjesec, 1), objektId)}
                className={btnOutline}
              >
                ▶
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-[#6f665a]">Objekt:</span>
              <Link
                href={buildUrl(mjesec, "")}
                className={`border px-3 py-1 text-sm font-black ${
                  !objektId
                    ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                    : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                }`}
              >
                Sve
              </Link>
              {objekti.map((o) => (
                <Link
                  key={o.id}
                  href={buildUrl(mjesec, o.id)}
                  className={`border px-3 py-1 text-sm font-black ${
                    objektId === o.id
                      ? "border-[#c79a57] bg-[#fff6e2] text-[#2e2923]"
                      : "border-[#e2d8c8] bg-white text-[#6f665a] hover:bg-[#f8f3ea]"
                  }`}
                >
                  {o.naziv}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 1. AUTO */}
        <div className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">1. Automatski troškovi</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Datum</th>
                  <th className={th}>Kategorija</th>
                  <th className={th}>Jedinica</th>
                  <th className={thR}>Iznos</th>
                  <th className={th}>Akcija</th>
                </tr>
              </thead>
              <tbody>
                {auto.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-[#6f665a]">
                      Nema automatskih troškova za ovaj mjesec.
                    </td>
                  </tr>
                ) : (
                  auto.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-[#eee3d4] align-top ${
                        t.storniran ? "bg-[#f5f5f5] text-[#9b8a6f]" : ""
                      }`}
                    >
                      <td className="p-2">{formatDatum(t.datum)}</td>
                      <td className="p-2">{katLabel(t.kategorija)}</td>
                      <td className="p-2">{jedLabel(t)}</td>
                      <td
                        className={`p-2 text-right font-black ${
                          t.storniran ? "line-through" : ""
                        }`}
                      >
                        {money(t.iznos)}
                      </td>
                      <td className="p-2">
                        {t.storniran ? (
                          <div>
                            <div className="text-xs">
                              (STORNIRANO: {t.stornoRazlog || "—"})
                            </div>
                            <form action={ponistiStorno} className="mt-1">
                              {hiddenFilteri}
                              <input type="hidden" name="id" value={t.id} />
                              <button className={btnOutline}>
                                Poništi storno
                              </button>
                            </form>
                          </div>
                        ) : (
                          <details>
                            <summary className="cursor-pointer font-black text-[#9b6b12]">
                              Storno ▸
                            </summary>
                            <form
                              action={storniraTrosak}
                              className="mt-2 flex flex-col gap-2"
                            >
                              {hiddenFilteri}
                              <input type="hidden" name="id" value={t.id} />
                              <textarea
                                name="razlog"
                                maxLength={200}
                                placeholder="Razlog storna (max 200)"
                                className={`${inputCls} w-full`}
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <button className={btn}>Storniraj</button>
                                <a
                                  href={buildUrl(mjesec, objektId)}
                                  className={btnOutline}
                                >
                                  Odustani
                                </a>
                              </div>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right font-black">
            Suma sekcije: {money(sumAuto)}
          </div>
        </div>

        {objektId ? (
          <p className="mb-4 text-xs text-[#9b8a6f]">
            ⓘ Ručni unosi nisu vezani na objekt (prikazani uvijek).
          </p>
        ) : null}

        {/* 2. Rubenina */}
        <div className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">2. Pranje rubenine</h2>
          <details className="mt-3">
            <summary className="cursor-pointer font-black text-[#9b6b12]">
              + Pranje rubenine ▸
            </summary>
            <form action={dodajRubeninu} className="mt-3 flex flex-wrap items-end gap-2">
              {hiddenFilteri}
              <label className="flex flex-col text-xs font-black">
                Datum
                <input type="date" name="datum" defaultValue={danasIso} className={inputCls} />
              </label>
              <label className="flex flex-col text-xs font-black">
                Kg
                <input type="number" step="0.01" min="0" name="kg" className={`${inputCls} w-24`} />
              </label>
              <label className="flex flex-1 flex-col text-xs font-black">
                Opis
                <input type="text" name="opis" className={`${inputCls} w-full`} />
              </label>
              <button className={btn}>Spremi</button>
            </form>
          </details>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Datum</th>
                  <th className={thR}>Kg</th>
                  <th className={thR}>Iznos</th>
                  <th className={th}>Opis</th>
                  <th className={th}>Akcija</th>
                </tr>
              </thead>
              <tbody>
                {rubenina.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-[#6f665a]">
                      Nema unosa.
                    </td>
                  </tr>
                ) : (
                  rubenina.map((t) => (
                    <tr key={t.id} className="border-b border-[#eee3d4] align-top">
                      <td className="p-2">{formatDatum(t.datum)}</td>
                      <td className="p-2 text-right">{t.kolicina ?? "-"}</td>
                      <td className="p-2 text-right font-black">{money(t.iznos)}</td>
                      <td className="p-2">{t.opis || "-"}</td>
                      <td className="p-2">
                        <details>
                          <summary className="cursor-pointer font-black text-[#9b6b12]">
                            Uredi ▸
                          </summary>
                          <form action={urediRucniTrosak} className="mt-2 flex flex-wrap items-end gap-2">
                            {hiddenFilteri}
                            <input type="hidden" name="id" value={t.id} />
                            <label className="flex flex-col text-xs font-black">
                              Datum
                              <input type="date" name="datum" defaultValue={isoDate(t.datum)} className={inputCls} />
                            </label>
                            <label className="flex flex-col text-xs font-black">
                              Kg
                              <input type="number" step="0.01" min="0" name="kolicina" defaultValue={t.kolicina ?? 0} className={`${inputCls} w-24`} />
                            </label>
                            <label className="flex flex-1 flex-col text-xs font-black">
                              Opis
                              <input type="text" name="opis" defaultValue={t.opis || ""} className={`${inputCls} w-full`} />
                            </label>
                            <button className={btn}>Spremi</button>
                            <a href={buildUrl(mjesec, objektId)} className={btnOutline}>Odustani</a>
                          </form>
                        </details>
                        <details className="mt-1">
                          <summary className="cursor-pointer font-black text-[#b42318]">
                            Obriši ▸
                          </summary>
                          <div className="mt-2">
                            <p className="text-xs text-[#6f665a]">
                              Sigurno obrisati ovaj trošak? Brisanje je trajno.
                            </p>
                            <form action={obrisiRucniTrosak} className="mt-1 flex gap-2">
                              {hiddenFilteri}
                              <input type="hidden" name="id" value={t.id} />
                              <button className={btn}>Obriši trajno</button>
                              <a href={buildUrl(mjesec, objektId)} className={btnOutline}>
                                Odustani
                              </a>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right font-black">Suma sekcije: {money(sumRub)}</div>
        </div>

        {/* 3. Generalno */}
        <div className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">3. Generalno čišćenje</h2>
          <details className="mt-3">
            <summary className="cursor-pointer font-black text-[#9b6b12]">
              + Generalno ▸
            </summary>
            <form action={dodajGeneralno} className="mt-3 flex flex-wrap items-end gap-2">
              {hiddenFilteri}
              <label className="flex flex-col text-xs font-black">
                Datum
                <input type="date" name="datum" defaultValue={danasIso} className={inputCls} />
              </label>
              <label className="flex flex-col text-xs font-black">
                Sati
                <input type="number" step="0.01" min="0" name="sati" className={`${inputCls} w-24`} />
              </label>
              <label className="flex flex-1 flex-col text-xs font-black">
                Opis
                <input type="text" name="opis" className={`${inputCls} w-full`} />
              </label>
              <button className={btn}>Spremi</button>
            </form>
          </details>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Datum</th>
                  <th className={thR}>Sati</th>
                  <th className={thR}>Iznos</th>
                  <th className={th}>Opis</th>
                  <th className={th}>Akcija</th>
                </tr>
              </thead>
              <tbody>
                {generalno.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-[#6f665a]">
                      Nema unosa.
                    </td>
                  </tr>
                ) : (
                  generalno.map((t) => (
                    <tr key={t.id} className="border-b border-[#eee3d4] align-top">
                      <td className="p-2">{formatDatum(t.datum)}</td>
                      <td className="p-2 text-right">{t.kolicina ?? "-"}</td>
                      <td className="p-2 text-right font-black">{money(t.iznos)}</td>
                      <td className="p-2">{t.opis || "-"}</td>
                      <td className="p-2">
                        <details>
                          <summary className="cursor-pointer font-black text-[#9b6b12]">
                            Uredi ▸
                          </summary>
                          <form action={urediRucniTrosak} className="mt-2 flex flex-wrap items-end gap-2">
                            {hiddenFilteri}
                            <input type="hidden" name="id" value={t.id} />
                            <label className="flex flex-col text-xs font-black">
                              Datum
                              <input type="date" name="datum" defaultValue={isoDate(t.datum)} className={inputCls} />
                            </label>
                            <label className="flex flex-col text-xs font-black">
                              Sati
                              <input type="number" step="0.01" min="0" name="kolicina" defaultValue={t.kolicina ?? 0} className={`${inputCls} w-24`} />
                            </label>
                            <label className="flex flex-1 flex-col text-xs font-black">
                              Opis
                              <input type="text" name="opis" defaultValue={t.opis || ""} className={`${inputCls} w-full`} />
                            </label>
                            <button className={btn}>Spremi</button>
                            <a href={buildUrl(mjesec, objektId)} className={btnOutline}>Odustani</a>
                          </form>
                        </details>
                        <details className="mt-1">
                          <summary className="cursor-pointer font-black text-[#b42318]">
                            Obriši ▸
                          </summary>
                          <div className="mt-2">
                            <p className="text-xs text-[#6f665a]">
                              Sigurno obrisati ovaj trošak? Brisanje je trajno.
                            </p>
                            <form action={obrisiRucniTrosak} className="mt-1 flex gap-2">
                              {hiddenFilteri}
                              <input type="hidden" name="id" value={t.id} />
                              <button className={btn}>Obriši trajno</button>
                              <a href={buildUrl(mjesec, objektId)} className={btnOutline}>
                                Odustani
                              </a>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right font-black">Suma sekcije: {money(sumGen)}</div>
        </div>

        {/* 4. Izvanredno */}
        <div className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">4. Izvanredno</h2>
          <details className="mt-3">
            <summary className="cursor-pointer font-black text-[#9b6b12]">
              + Izvanredno ▸
            </summary>
            <form action={dodajIzvanredno} className="mt-3 flex flex-wrap items-end gap-2">
              {hiddenFilteri}
              <label className="flex flex-col text-xs font-black">
                Datum
                <input type="date" name="datum" defaultValue={danasIso} className={inputCls} />
              </label>
              <label className="flex flex-col text-xs font-black">
                Iznos (€)
                <input type="number" step="0.01" min="0" name="iznos" className={`${inputCls} w-28`} />
              </label>
              <label className="flex flex-1 flex-col text-xs font-black">
                Opis
                <input type="text" name="opis" className={`${inputCls} w-full`} />
              </label>
              <button className={btn}>Spremi</button>
            </form>
          </details>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Datum</th>
                  <th className={thR}>Iznos</th>
                  <th className={th}>Opis</th>
                  <th className={th}>Akcija</th>
                </tr>
              </thead>
              <tbody>
                {izvanredno.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-[#6f665a]">
                      Nema unosa.
                    </td>
                  </tr>
                ) : (
                  izvanredno.map((t) => (
                    <tr key={t.id} className="border-b border-[#eee3d4] align-top">
                      <td className="p-2">{formatDatum(t.datum)}</td>
                      <td className="p-2 text-right font-black">{money(t.iznos)}</td>
                      <td className="p-2">{t.opis || "-"}</td>
                      <td className="p-2">
                        <details>
                          <summary className="cursor-pointer font-black text-[#9b6b12]">
                            Uredi ▸
                          </summary>
                          <form action={urediRucniTrosak} className="mt-2 flex flex-wrap items-end gap-2">
                            {hiddenFilteri}
                            <input type="hidden" name="id" value={t.id} />
                            <label className="flex flex-col text-xs font-black">
                              Datum
                              <input type="date" name="datum" defaultValue={isoDate(t.datum)} className={inputCls} />
                            </label>
                            <label className="flex flex-col text-xs font-black">
                              Iznos (€)
                              <input type="number" step="0.01" min="0" name="iznos" defaultValue={t.iznos} className={`${inputCls} w-28`} />
                            </label>
                            <label className="flex flex-1 flex-col text-xs font-black">
                              Opis
                              <input type="text" name="opis" defaultValue={t.opis || ""} className={`${inputCls} w-full`} />
                            </label>
                            <button className={btn}>Spremi</button>
                            <a href={buildUrl(mjesec, objektId)} className={btnOutline}>Odustani</a>
                          </form>
                        </details>
                        <details className="mt-1">
                          <summary className="cursor-pointer font-black text-[#b42318]">
                            Obriši ▸
                          </summary>
                          <div className="mt-2">
                            <p className="text-xs text-[#6f665a]">
                              Sigurno obrisati ovaj trošak? Brisanje je trajno.
                            </p>
                            <form action={obrisiRucniTrosak} className="mt-1 flex gap-2">
                              {hiddenFilteri}
                              <input type="hidden" name="id" value={t.id} />
                              <button className={btn}>Obriši trajno</button>
                              <a href={buildUrl(mjesec, objektId)} className={btnOutline}>
                                Odustani
                              </a>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right font-black">Suma sekcije: {money(sumIzv)}</div>
        </div>

        {/* Ukupno */}
        <div className="mb-10 flex items-center justify-between border border-[#caa870] bg-[#fff6e2] px-4 py-3">
          <span className="text-sm font-black uppercase tracking-[0.14em] text-[#7a5a22]">
            Ukupno mjesec
          </span>
          <span className="text-2xl font-black text-[#2e2923]">{money(ukupno)}</span>
        </div>
      </div>
    </main>
  );
}
