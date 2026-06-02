import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";
import { getRezervacijeIBlokade } from "@/lib/rezervacije-union";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

function money(v?: number | null) {
  return `${Number(v || 0).toFixed(2)} €`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Vraća number za valjan unos, ili NULL kad je polje prazno / nevaljano /
// negativno → pozivatelj tada NE dira postojeću vrijednost (prazno = ne mijenja).
// Za eksplicitnu nulu treba upisati "0".
function parseEur(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function dohvatiPostavkeId(): Promise<string> {
  const p = await prisma.ciscenjeMailPostavke.findFirst();
  if (p) return p.id;
  const novi = await prisma.ciscenjeMailPostavke.create({ data: {} });
  return novi.id;
}

// ── Server actions ───────────────────────────────────────────────

async function spremiCijeneCiscenja(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("ciscenje_")) continue;
    const jedinicaId = key.slice("ciscenje_".length);
    const cijena = parseEur(value);
    if (cijena === null) continue; // prazno polje = ne diraj postojeću cijenu
    await prisma.cjenikCiscenjaJedinice.upsert({
      where: { jedinicaId },
      update: { cijenaCiscenja: cijena },
      create: { jedinicaId, cijenaCiscenja: cijena },
    });
  }

  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=ciscenje");
}

async function spremiCijenePosteljine(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("posteljina_")) continue;
    const jedinicaId = key.slice("posteljina_".length);
    const cijena = parseEur(value);
    if (cijena === null) continue; // prazno polje = ne diraj postojeću cijenu
    await prisma.cjenikCiscenjaJedinice.upsert({
      where: { jedinicaId },
      update: { cijenaPosteljina: cijena },
      create: { jedinicaId, cijenaPosteljina: cijena },
    });
  }

  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=posteljina");
}

async function spremiBazen(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const cijena = parseEur(formData.get("bazenCijena"));
  if (cijena !== null) {
    const id = await dohvatiPostavkeId();
    await prisma.ciscenjeMailPostavke.update({
      where: { id },
      data: { bazenCijena: cijena },
    });
  }
  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=bazen");
}

async function spremiStubiste(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const cijena = parseEur(formData.get("stubisteCijena"));
  if (cijena !== null) {
    const id = await dohvatiPostavkeId();
    await prisma.ciscenjeMailPostavke.update({
      where: { id },
      data: { stubisteCijena: cijena },
    });
  }
  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=stubiste");
}

async function spremiFiksneStope(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = await dohvatiPostavkeId();
  const data: Record<string, unknown> = {};
  const rubenina = parseEur(formData.get("rubeninaCijenaPoKg"));
  const generalno = parseEur(formData.get("generalnoCijenaPoSatu"));
  if (rubenina !== null) data.rubeninaCijenaPoKg = rubenina; // prazno = ne diraj
  if (generalno !== null) data.generalnoCijenaPoSatu = generalno; // prazno = ne diraj
  await prisma.ciscenjeMailPostavke.update({ where: { id }, data });
  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=fiksne");
}

// ── UI ───────────────────────────────────────────────────────────

const PORUKE: Record<string, string> = {
  ciscenje: "Cijene završnog čišćenja spremljene.",
  posteljina: "Cijene promjene posteljine spremljene.",
  bazen: "Bazen Marty spremljen.",
  stubiste: "Stubište Eva spremljeno.",
  fiksne: "Fiksne stope spremljene.",
};

export default async function CjenikAgencijePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const jedinice = await prisma.jedinica.findMany({
    where: { aktivna: true },
    include: { objekt: true, cjenikCiscenja: true },
    orderBy: [{ objekt: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  const cjenikPrazan = jedinice.every((j) => !j.cjenikCiscenja);
  const toast = sp.saved ? PORUKE[sp.saved] : "";

  // ── Projekcija troškova: danas .. 31.12.2026 ─────────────────────
  const danas = startOfDay(new Date());
  const krajGodine = new Date(2026, 11, 31, 23, 59, 59, 999);

  const kartice = await getRezervacijeIBlokade({
    ukljuciOtkazane: false,
    datumOd: danas,
    datumDo: krajGodine,
  });

  type Proj = {
    zavrsnoCount: number;
    zavrsnoIznos: number;
    posteljinaCount: number;
    posteljinaIznos: number;
  };
  const proj = new Map<string, Proj>();
  const cjenikMap = new Map<string, { ciscenje: number; posteljina: number }>();
  for (const j of jedinice) {
    proj.set(j.id, {
      zavrsnoCount: 0,
      zavrsnoIznos: 0,
      posteljinaCount: 0,
      posteljinaIznos: 0,
    });
    cjenikMap.set(j.id, {
      ciscenje: j.cjenikCiscenja?.cijenaCiscenja ?? 0,
      posteljina: j.cjenikCiscenja?.cijenaPosteljina ?? 0,
    });
  }

  for (const c of kartice) {
    const p = proj.get(c.jedinica.id);
    const cijene = cjenikMap.get(c.jedinica.id);
    if (!p || !cijene) continue;

    const datumDo = startOfDay(c.datumDo);
    if (datumDo >= danas && datumDo <= krajGodine) {
      p.zavrsnoCount++;
      p.zavrsnoIznos += cijene.ciscenje;
    }

    const nocenja = c.brojNocenja || 0;
    if (nocenja > 7) {
      const midstay = addDays(startOfDay(c.datumOd), Math.floor(nocenja / 2));
      if (midstay >= danas && midstay <= krajGodine) {
        p.posteljinaCount++;
        p.posteljinaIznos += cijene.posteljina;
      }
    }
  }

  // Bazen / Stubište: broj dana u rasponu po danu u tjednu (getDay 0 = Nedjelja).
  const bazenDani = [
    postavke?.martyBazenNedjelja,
    postavke?.martyBazenPonedjeljak,
    postavke?.martyBazenUtorak,
    postavke?.martyBazenSrijeda,
    postavke?.martyBazenCetvrtak,
    postavke?.martyBazenPetak,
    postavke?.martyBazenSubota,
  ];
  const stubisteDani = [
    postavke?.evaStubisteNedjelja,
    postavke?.evaStubistePonedjeljak,
    postavke?.evaStubisteUtorak,
    postavke?.evaStubisteSrijeda,
    postavke?.evaStubisteCetvrtak,
    postavke?.evaStubistePetak,
    postavke?.evaStubisteSubota,
  ];
  let brBazenDana = 0;
  let brStubisteDana = 0;
  for (let d = new Date(danas); d <= krajGodine; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (bazenDani[wd]) brBazenDana++;
    if (stubisteDani[wd]) brStubisteDana++;
  }
  const bazenIznos = brBazenDana * (postavke?.bazenCijena ?? 0);
  const stubisteIznos = brStubisteDana * (postavke?.stubisteCijena ?? 0);

  // Grupiranje po objektu (jedinice su već sortirane po objektu).
  const grupe: {
    objektId: string;
    objektNaziv: string;
    jedinice: typeof jedinice;
  }[] = [];
  for (const j of jedinice) {
    let g = grupe.find((x) => x.objektId === j.objekt.id);
    if (!g) {
      g = { objektId: j.objekt.id, objektNaziv: j.objekt.naziv, jedinice: [] };
      grupe.push(g);
    }
    g.jedinice.push(j);
  }

  let grandTotal = bazenIznos + stubisteIznos;
  for (const p of proj.values()) grandTotal += p.zavrsnoIznos + p.posteljinaIznos;

  // styles
  const card =
    "border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]";
  const inputCls =
    "w-28 border border-[#d8c8aa] bg-[#fcfaf6] px-2 py-1 text-right text-[#2e2923]";
  const btn =
    "cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-2 text-sm font-black text-white transition hover:brightness-95";
  const th =
    "border-b border-[#e2d8c8] p-2 text-left text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]";
  const thR = `${th} text-right`;

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
        <div className={`mb-6 ${card}`}>
          <Link
            href="/admin"
            className="cursor-pointer text-sm font-black text-[#9b6b12] hover:text-[#2e2923]"
          >
            ← Admin
          </Link>
          <h1 className="mt-4 text-4xl font-black">Cjenik čišćenja</h1>
          <p className="mt-2 text-[#6f665a]">
            Cijene po jedinici i fiksne stope. Cijene se snimaju kao trošak u
            trenutku nastanka (kasnije promjene cjenika ne mijenjaju prošle
            troškove). Dani čišćenja bazena i stubišta postavljaju se u
            &quot;Čišćenje i plan&quot;.
          </p>

          {toast ? (
            <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">
              ✓ {toast}
            </div>
          ) : null}

          {cjenikPrazan ? (
            <div className="mt-4 border border-[#caa870] bg-[#fff6e2] px-4 py-2 text-sm text-[#7a5a22]">
              Cijene još nisu upisane. Upiši cijene po sekcijama prema važećem
              ugovoru s agencijom za čišćenje.
            </div>
          ) : null}
        </div>

        {/* Projekcija troškova */}
        <div className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">Projekcija troškova</h2>
          <p className="mt-1 text-xs text-[#6f665a]">
            Raspon: danas – 31.12.2026. Projekcija ne uključuje pranje rubenine
            (naplata po kg) niti generalno čišćenje (€/sat).
          </p>

          {grupe.map((g) => {
            const jeMarty = g.objektNaziv.includes("Marty");
            const jeEva = g.objektNaziv.includes("Eva");
            const unitSum = g.jedinice.reduce((s, j) => {
              const p = proj.get(j.id)!;
              return s + p.zavrsnoIznos + p.posteljinaIznos;
            }, 0);
            const extra = (jeMarty ? bazenIznos : 0) + (jeEva ? stubisteIznos : 0);
            const objektTotal = unitSum + extra;

            return (
              <div key={g.objektId} className="mt-5">
                <div className="font-black text-[#2e2923]">{g.objektNaziv}</div>
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full min-w-[640px] text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Stavka</th>
                        <th className={thR}>Čišćenje (kom)</th>
                        <th className={thR}>Čišćenje (€)</th>
                        <th className={thR}>Posteljina (kom)</th>
                        <th className={thR}>Posteljina (€)</th>
                        <th className={thR}>Ukupno (€)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.jedinice.map((j) => {
                        const p = proj.get(j.id)!;
                        const uk = p.zavrsnoIznos + p.posteljinaIznos;
                        return (
                          <tr key={j.id} className="border-b border-[#eee3d4]">
                            <td className="p-2 font-black">{j.naziv}</td>
                            <td className="p-2 text-right">{p.zavrsnoCount}</td>
                            <td className="p-2 text-right">
                              {money(p.zavrsnoIznos)}
                            </td>
                            <td className="p-2 text-right">
                              {p.posteljinaCount}
                            </td>
                            <td className="p-2 text-right">
                              {money(p.posteljinaIznos)}
                            </td>
                            <td className="p-2 text-right font-black">
                              {money(uk)}
                            </td>
                          </tr>
                        );
                      })}

                      {jeMarty ? (
                        <tr className="border-b border-[#eee3d4]">
                          <td className="p-2 font-black">Bazen Marty</td>
                          <td className="p-2 text-right">{brBazenDana}</td>
                          <td className="p-2 text-right">{money(bazenIznos)}</td>
                          <td className="p-2 text-right">—</td>
                          <td className="p-2 text-right">—</td>
                          <td className="p-2 text-right font-black">
                            {money(bazenIznos)}
                          </td>
                        </tr>
                      ) : null}

                      {jeEva ? (
                        <tr className="border-b border-[#eee3d4]">
                          <td className="p-2 font-black">Stubište Eva</td>
                          <td className="p-2 text-right">{brStubisteDana}</td>
                          <td className="p-2 text-right">
                            {money(stubisteIznos)}
                          </td>
                          <td className="p-2 text-right">—</td>
                          <td className="p-2 text-right">—</td>
                          <td className="p-2 text-right font-black">
                            {money(stubisteIznos)}
                          </td>
                        </tr>
                      ) : null}

                      <tr className="bg-[#f8f3ea]">
                        <td className="p-2 font-black" colSpan={5}>
                          Ukupno {g.objektNaziv}
                        </td>
                        <td className="p-2 text-right font-black">
                          {money(objektTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="mt-6 flex items-center justify-between border border-[#caa870] bg-[#fff6e2] px-4 py-3">
            <span className="text-sm font-black uppercase tracking-[0.14em] text-[#7a5a22]">
              Ukupna projekcija
            </span>
            <span className="text-2xl font-black text-[#2e2923]">
              {money(grandTotal)}
            </span>
          </div>
        </div>

        {/* 1. Završno čišćenje po jedinici */}
        <form action={spremiCijeneCiscenja} className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">1. Završno čišćenje po jedinici</h2>
          <p className="mt-1 text-sm text-[#6f665a]">
            Naplaćuje se pri svakoj smjeni gosta.
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Jedinica</th>
                <th className={thR}>Cijena (€)</th>
              </tr>
            </thead>
            <tbody>
              {jedinice.map((j) => (
                <tr key={j.id} className="border-b border-[#eee3d4]">
                  <td className="p-2">
                    <span className="font-black">{j.naziv}</span>
                    <span className="ml-2 text-xs text-[#6f665a]">
                      {j.objekt.naziv}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <input
                      className={inputCls}
                      type="number"
                      step="0.01"
                      min="0"
                      name={`ciscenje_${j.id}`}
                      defaultValue={j.cjenikCiscenja?.cijenaCiscenja ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className={`mt-4 ${btn}`}>Spremi</button>
        </form>

        {/* 2. Promjena posteljine po jedinici */}
        <form action={spremiCijenePosteljine} className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">
            2. Promjena posteljine po jedinici
          </h2>
          <p className="mt-1 text-sm text-[#6f665a]">
            Naplaćuje se samo za boravke duže od 7 noći (midstay).
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Jedinica</th>
                <th className={thR}>Cijena (€)</th>
              </tr>
            </thead>
            <tbody>
              {jedinice.map((j) => (
                <tr key={j.id} className="border-b border-[#eee3d4]">
                  <td className="p-2">
                    <span className="font-black">{j.naziv}</span>
                    <span className="ml-2 text-xs text-[#6f665a]">
                      {j.objekt.naziv}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <input
                      className={inputCls}
                      type="number"
                      step="0.01"
                      min="0"
                      name={`posteljina_${j.id}`}
                      defaultValue={j.cjenikCiscenja?.cijenaPosteljina ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className={`mt-4 ${btn}`}>Spremi</button>
        </form>

        {/* 3. Bazen Marty */}
        <form action={spremiBazen} className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">3. Bazen Marty</h2>
          <div className="mt-4 flex items-center gap-2">
            <label className="text-sm font-black">Cijena po čišćenju (€)</label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              min="0"
              name="bazenCijena"
              defaultValue={postavke?.bazenCijena ?? 25}
            />
          </div>
          <p className="mt-2 text-xs text-[#6f665a]">
            Dani čišćenja se postavljaju u &quot;Čišćenje i plan&quot;.
          </p>
          <button className={`mt-4 ${btn}`}>Spremi</button>
        </form>

        {/* 4. Stubište Eva */}
        <form action={spremiStubiste} className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">4. Stubište Eva</h2>
          <div className="mt-4 flex items-center gap-2">
            <label className="text-sm font-black">Cijena po čišćenju (€)</label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              min="0"
              name="stubisteCijena"
              defaultValue={postavke?.stubisteCijena ?? 10}
            />
          </div>
          <p className="mt-2 text-xs text-[#6f665a]">
            Dani čišćenja se postavljaju u &quot;Čišćenje i plan&quot;.
          </p>
          <button className={`mt-4 ${btn}`}>Spremi</button>
        </form>

        {/* 5. Fiksne stope */}
        <form action={spremiFiksneStope} className={`mb-6 ${card}`}>
          <h2 className="text-2xl font-black">5. Fiksne stope</h2>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="w-56 text-sm font-black">
                Pranje rubenine (€/kg)
              </label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                min="0"
                name="rubeninaCijenaPoKg"
                defaultValue={postavke?.rubeninaCijenaPoKg ?? 3.3}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-56 text-sm font-black">
                Generalno čišćenje (€/sat)
              </label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                min="0"
                name="generalnoCijenaPoSatu"
                defaultValue={postavke?.generalnoCijenaPoSatu ?? 18}
              />
            </div>
          </div>
          <button className={`mt-4 ${btn}`}>Spremi</button>
        </form>
      </div>
    </main>
  );
}
