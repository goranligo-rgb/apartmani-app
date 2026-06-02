import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminSessionOk } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  saved?: string;
  init?: string;
  missing?: string;
}>;

// Cjenik iz ugovora Adonija 143-2026 (match po Jedinica.naziv).
const SEED_CJENIK = [
  { naziv: "Eva 1", cijenaCiscenja: 79, cijenaPosteljina: 20 },
  { naziv: "Eva 2", cijenaCiscenja: 65, cijenaPosteljina: 20 },
  { naziv: "Eva 3", cijenaCiscenja: 65, cijenaPosteljina: 20 },
  { naziv: "Marty 1", cijenaCiscenja: 55, cijenaPosteljina: 20 },
  { naziv: "Marty 2", cijenaCiscenja: 79, cijenaPosteljina: 20 },
  { naziv: "Marty 3", cijenaCiscenja: 55, cijenaPosteljina: 20 },
  { naziv: "Marty 4", cijenaCiscenja: 79, cijenaPosteljina: 20 },
  { naziv: "Marty 5", cijenaCiscenja: 109, cijenaPosteljina: 35 },
  { naziv: "House Art", cijenaCiscenja: 139, cijenaPosteljina: 50 },
];

const DANI = [
  { key: "Ponedjeljak", label: "Pon" },
  { key: "Utorak", label: "Uto" },
  { key: "Srijeda", label: "Sri" },
  { key: "Cetvrtak", label: "Čet" },
  { key: "Petak", label: "Pet" },
  { key: "Subota", label: "Sub" },
  { key: "Nedjelja", label: "Ned" },
] as const;

function money(v?: number | null) {
  return `${Number(v || 0).toFixed(2)} €`;
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

async function inicijalizirajCjenik() {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const missing: string[] = [];

  for (const item of SEED_CJENIK) {
    const jed = await prisma.jedinica.findFirst({
      where: { naziv: item.naziv },
      select: { id: true },
    });
    if (!jed) {
      missing.push(item.naziv);
      continue;
    }
    await prisma.cjenikCiscenjaJedinice.upsert({
      where: { jedinicaId: jed.id },
      update: {
        cijenaCiscenja: item.cijenaCiscenja,
        cijenaPosteljina: item.cijenaPosteljina,
      },
      create: {
        jedinicaId: jed.id,
        cijenaCiscenja: item.cijenaCiscenja,
        cijenaPosteljina: item.cijenaPosteljina,
      },
    });
  }

  revalidatePath("/admin/cjenik-agencije");
  const q = missing.length
    ? `?init=done&missing=${encodeURIComponent(missing.join(","))}`
    : "?init=done";
  redirect(`/admin/cjenik-agencije${q}`);
}

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

  const id = await dohvatiPostavkeId();
  const data: Record<string, unknown> = {};
  const bazenCijena = parseEur(formData.get("bazenCijena"));
  if (bazenCijena !== null) data.bazenCijena = bazenCijena; // prazno = ne diraj cijenu
  for (const d of DANI) {
    data[`martyBazen${d.key}`] = formData.get(`martyBazen${d.key}`) != null;
  }

  await prisma.ciscenjeMailPostavke.update({ where: { id }, data });
  revalidatePath("/admin/cjenik-agencije");
  redirect("/admin/cjenik-agencije?saved=bazen");
}

async function spremiStubiste(formData: FormData) {
  "use server";
  if (!(await adminSessionOk())) redirect("/admin");

  const id = await dohvatiPostavkeId();
  const data: Record<string, unknown> = {};
  const stubisteCijena = parseEur(formData.get("stubisteCijena"));
  if (stubisteCijena !== null) data.stubisteCijena = stubisteCijena; // prazno = ne diraj cijenu
  for (const d of DANI) {
    data[`evaStubiste${d.key}`] = formData.get(`evaStubiste${d.key}`) != null;
  }

  await prisma.ciscenjeMailPostavke.update({ where: { id }, data });
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

export default async function CjenikCiscenjaPage({
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
  const postavkeRec = postavke as Record<string, unknown> | null;

  const cjenikPrazan = jedinice.every((j) => !j.cjenikCiscenja);

  const toast =
    (sp.saved && PORUKE[sp.saved]) ||
    (sp.init === "done"
      ? sp.missing
        ? `Cjenik inicijaliziran. Nije pronađeno u bazi: ${decodeURIComponent(sp.missing)}`
        : "Cjenik inicijaliziran iz ugovora."
      : "");

  const card =
    "border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]";
  const inputCls =
    "w-28 border border-[#d8c8aa] bg-[#fcfaf6] px-2 py-1 text-right text-[#2e2923]";
  const btn =
    "cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-2 text-sm font-black text-white transition hover:brightness-95";
  const th =
    "border-b border-[#e2d8c8] p-2 text-left text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]";

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
            Cijene po jedinici, fiksne stope te dani čišćenja bazena i
            stubišta. Cijene se snimaju kao trošak u trenutku nastanka (kasnije
            promjene cjenika ne mijenjaju prošle troškove).
          </p>

          {toast ? (
            <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">
              ✓ {toast}
            </div>
          ) : null}

          {cjenikPrazan ? (
            <form action={inicijalizirajCjenik} className="mt-4">
              <button className={btn}>Inicijaliziraj cjenik iz ugovora</button>
              <span className="ml-3 text-xs text-[#6f665a]">
                Učitava 9 jedinica iz ugovora 143-2026.
              </span>
            </form>
          ) : null}
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
                <th className={`${th} text-right`}>Cijena (€)</th>
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
                <th className={`${th} text-right`}>Cijena (€)</th>
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
          <div className="mt-4 text-sm font-black text-[#7a5a22]">
            Dani čišćenja
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {DANI.map((d) => (
              <label key={d.key} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name={`martyBazen${d.key}`}
                  defaultChecked={Boolean(postavkeRec?.[`martyBazen${d.key}`])}
                />
                {d.label}
              </label>
            ))}
          </div>
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
          <div className="mt-4 text-sm font-black text-[#7a5a22]">
            Dani čišćenja
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {DANI.map((d) => (
              <label key={d.key} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name={`evaStubiste${d.key}`}
                  defaultChecked={Boolean(postavkeRec?.[`evaStubiste${d.key}`])}
                />
                {d.label}
              </label>
            ))}
          </div>
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

        <p className="pb-10 text-xs text-[#6f665a]">
          Ukupno jedinica: {jedinice.length} · primjer cijene čišćenja:{" "}
          {money(jedinice[0]?.cjenikCiscenja?.cijenaCiscenja)}
        </p>
      </div>
    </main>
  );
}
