import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { generirajINaPosalji } from "@/lib/ciscenje/generirajINaPosalji";
import { adminSessionOk } from "@/lib/admin-auth";
// Predikat dana čišćenja po konkretnom datumu — jedini izvor istine.
import { martyBazenZaDan, evaStubisteZaDan, formatYMD } from "@/lib/ciscenje/daniCiscenja";
import { formatZagreb } from "@/lib/dates";

export const dynamic = "force-dynamic";

async function spremiPostavke(formData: FormData) {
  "use server";

  const naziv = String(formData.get("naziv") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const ccEmails = String(formData.get("ccEmails") || "").trim();
  const telefon = String(formData.get("telefon") || "").trim();

  if (!email) redirect("/admin/ciscenje?error=email");

  const agencija = await prisma.ciscenjeAgencija.findFirst();

  if (agencija) {
    await prisma.ciscenjeAgencija.update({
      where: { id: agencija.id },
      data: {
        naziv: naziv || "Agencija za čišćenje",
        email,
        ccEmails,
        telefon,
      },
    });
  } else {
    await prisma.ciscenjeAgencija.create({
      data: {
        naziv: naziv || "Agencija za čišćenje",
        email,
        ccEmails,
        telefon,
      },
    });
  }

  const data = {
    aktivno: !!formData.get("aktivno"),

    saljiPonedjeljak: !!formData.get("saljiPonedjeljak"),
    saljiUtorak: !!formData.get("saljiUtorak"),
    saljiSrijeda: !!formData.get("saljiSrijeda"),
    saljiCetvrtak: !!formData.get("saljiCetvrtak"),
    saljiPetak: !!formData.get("saljiPetak"),
    saljiSubota: !!formData.get("saljiSubota"),
    saljiNedjelja: !!formData.get("saljiNedjelja"),

    satSlanja: Number(formData.get("satSlanja") || 8),
    minutaSlanja: Number(formData.get("minutaSlanja") || 0),
    brojDanaUnaprijed: Number(formData.get("brojDanaUnaprijed") || 7),

    // Dani čišćenja zajedničkih prostora — sada KONKRETNI datumi ("YYYY-MM-DD"),
    // ne više dan u tjednu. Svaka kućica u sekciji dijeli isti `name`, a value je
    // YMD string; getAll vrati SAMO čekirane. Dates izvan prikazanog prozora se
    // ovim spremanjem prirodno prune-aju (lista = točno ono što je čekirano).
    // Stari boolean stupci (martyBazen*/evaStubiste*) su MRTVI — ne pišemo ih.
    martyBazenDatumi: formData.getAll("martyBazenDatum").map(String),
    evaStubisteDatumi: formData.getAll("evaStubisteDatum").map(String),
    martyStubisteDatumi: formData.getAll("martyStubisteDatum").map(String),
  };

  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  if (postavke) {
    await prisma.ciscenjeMailPostavke.update({
      where: { id: postavke.id },
      data,
    });
  } else {
    await prisma.ciscenjeMailPostavke.create({ data });
  }

  redirect("/admin/ciscenje?saved=1");
}

async function spremiNapomenu(formData: FormData) {
  "use server";

  // Eksplicitni guard (osim middleware-a) — server action piše u bazu.
  if (!(await adminSessionOk())) redirect("/admin/login");

  const napomena = String(formData.get("napomenaAgenciji") || "").trim();

  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  if (postavke) {
    await prisma.ciscenjeMailPostavke.update({
      where: { id: postavke.id },
      data: { napomenaAgenciji: napomena || null },
    });
  } else {
    await prisma.ciscenjeMailPostavke.create({
      data: { napomenaAgenciji: napomena || null },
    });
  }

  redirect("/admin/ciscenje?napomenaSaved=1#napomena");
}

async function posaljiOdmah() {
  "use server";

  const result = await generirajINaPosalji();

  if (result?.error) {
    redirect(`/admin/ciscenje?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/admin/ciscenje?sent=1");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDatum(d: Date) {
  return d.toLocaleDateString("hr-HR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function guestName(gost: any) {
  return `${gost?.ime || ""} ${gost?.prezime || ""}`.trim() || "-";
}

// Lista datuma za kućice odabira (sekcije bazen / stubište Eva / stubište Marty).
// N = brojDanaUnaprijed kućica, počevši od DANAS (Zagreb), redom. `value` je
// formatYMD ("YYYY-MM-DD") — isto što predikat (martyBazenZaDan…) kasnije čita,
// pa se odabir i generiranje garantirano poklapaju. `danas` se računa isto kao u
// generiranju (startOfDay(new Date())), pa su prozori usklađeni. `label` je
// hrvatski "pon, 16. 06." (Zagreb zona).
function datumiZaOdabir(danas: Date, broj: number) {
  const lista: { value: string; label: string }[] = [];
  for (let i = 0; i < broj; i++) {
    const d = addDays(danas, i);
    lista.push({
      value: formatYMD(d),
      label: formatZagreb(d, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    });
  }
  return lista;
}

function tipLabel(tip: string) {
  if (tip === "ZAVRSNO_CISCENJE") return "Završno čišćenje";
  if (tip === "MEDJUCISCENJE_I_POSTELJINA") {
    return "Međučisćenje + posteljina + ručnici";
  }
  if (tip === "DODATNO_CISCENJE") return "Dodatno čišćenje";
  return tip;
}

// Eksterni kanali — gost je platio platformi (Booking/Airbnb) ili je rezervacija
// upisana TEK kad je bankovna uplata već vidljiva (TEKUCI_RACUN).
const EKSTERNI_KANALI = ["BOOKING", "AIRBNB", "TEKUCI_RACUN"];

function trebaUpozorenjeZaUplatu(r: {
  izvor: string;
  iznosPlaceno: number | null;
  placenoKarticom: boolean;
}): boolean {
  if (EKSTERNI_KANALI.includes(r.izvor)) return false;
  if ((r.iznosPlaceno || 0) > 0) return false;
  if (r.placenoKarticom === true) return false;
  return true;
}

type PlanItem = {
  id: string;
  datum: Date;
  tip: string;
  objekt: string;
  jedinica: string;
  gost: string;
  brojGostiju: number | string;
  opis: string;
  sljedeciUlazak: string;
  brziUlazak: boolean;
  nemaUplate: boolean;
};

export default async function CiscenjeAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string;
    sent?: string;
    napomenaSaved?: string;
    error?: string;
    dana?: string;
  }>;
}) {
  const params = await searchParams;
  const agencija = await prisma.ciscenjeAgencija.findFirst();
  const postavke = await prisma.ciscenjeMailPostavke.findFirst();

  const brojDanaZaPlan = Number(
    params?.dana || postavke?.brojDanaUnaprijed || 7
  );

  const danas = startOfDay(new Date());
  const doDatuma = addDays(danas, brojDanaZaPlan);

  // Kućice za odabir datuma čišćenja prate SPREMLJENI brojDanaUnaprijed (ne
  // preview `dana` param). Promjena broja dana → Spremi → kućice se osvježe.
  const brojDanaKucice = postavke?.brojDanaUnaprijed ?? 7;
  const datumiKucice = datumiZaOdabir(danas, brojDanaKucice);

  const rezervacijeZaOdlazak = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      datumDo: {
        gte: danas,
        lte: doDatuma,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: {
      datumDo: "asc",
    },
  });

  const dugeRezervacije = await prisma.rezervacija.findMany({
    where: {
      status: {
        not: "OTKAZANO",
      },
      automatskoCiscenje: true,
      automatskaPosteljina: true,
      brojNocenja: {
        gt: 7,
      },
      datumOd: {
        lt: doDatuma,
      },
      datumDo: {
        gt: danas,
      },
    },
    include: {
      gost: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: {
      datumOd: "asc",
    },
  });

  const planItems: PlanItem[] = [];

  for (const r of rezervacijeZaOdlazak) {
    const sljedecaRezervacija = await prisma.rezervacija.findFirst({
      where: {
        id: {
          not: r.id,
        },
        jedinicaId: r.jedinicaId,
        status: {
          not: "OTKAZANO",
        },
        datumOd: {
          gte: r.datumDo,
        },
      },
      include: {
        gost: true,
      },
      orderBy: {
        datumOd: "asc",
      },
    });

    const brziUlazak = sljedecaRezervacija
      ? sameDay(r.datumDo, sljedecaRezervacija.datumOd)
      : false;

    const sljedeciUlazak = sljedecaRezervacija
      ? `${formatDatum(sljedecaRezervacija.datumOd)} — ${guestName(
        sljedecaRezervacija.gost
      )}`
      : "Nema najavljenog ulaska";

    planItems.push({
      id: `odlazak-${r.id}`,
      datum: startOfDay(r.datumDo),
      tip: "ZAVRSNO_CISCENJE",
      objekt: r.jedinica.objekt.naziv,
      jedinica: r.jedinica.naziv,
      gost: guestName(r.gost),
      brojGostiju: r.brojOsoba || "-",
      opis: brziUlazak
        ? "BRZI ULAZAK isti dan — očistiti odmah nakon odlaska gosta."
        : "Završno čišćenje nakon odlaska gosta.",
      sljedeciUlazak,
      brziUlazak,
      nemaUplate: trebaUpozorenjeZaUplatu(r),
    });
  }

  for (const r of dugeRezervacije) {
    const pocetak = startOfDay(r.datumOd);
    const kraj = startOfDay(r.datumDo);
    const polaBoravka = Math.floor(Number(r.brojNocenja || 0) / 2);
    const datumMedjuciscenja = addDays(pocetak, polaBoravka);

    if (datumMedjuciscenja <= pocetak || datumMedjuciscenja >= kraj) {
      continue;
    }

    if (datumMedjuciscenja < danas || datumMedjuciscenja > doDatuma) {
      continue;
    }

    planItems.push({
      id: `medju-${r.id}`,
      datum: datumMedjuciscenja,
      tip: "MEDJUCISCENJE_I_POSTELJINA",
      objekt: r.jedinica.objekt.naziv,
      jedinica: r.jedinica.naziv,
      gost: guestName(r.gost),
      brojGostiju: r.brojOsoba || "-",
      opis:
        "Gost ostaje dulje od 7 noći — očistiti apartman/kuću, promijeniti posteljinu i ostaviti nove ručnike.",
      sljedeciUlazak: "Gost ostaje u smještaju",
      brziUlazak: false,
      nemaUplate: trebaUpozorenjeZaUplatu(r),
    });
  }

  const prvaMartyJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Marty",
        },
      },
    },
    include: {
      objekt: true,
    },
  });

  if (postavke && prvaMartyJedinica) {
    let d = new Date(danas);

    while (d <= doDatuma) {
      if (martyBazenZaDan(postavke, d)) {
        planItems.push({
          id: `bazen-${d.toISOString()}`,
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          objekt: prvaMartyJedinica.objekt.naziv,
          jedinica: "Marty bazen / okoliš",
          gost: "-",
          brojGostiju: "-",
          opis: "Čišćenje bazena i okoliša.",
          sljedeciUlazak: "-",
          brziUlazak: false,
          nemaUplate: false,
        });
      }

      d = addDays(d, 1);
    }
  }

  // Stubište Eva — popravak nedosljednosti: prije se prikazivao SAMO bazen.
  // Sad i Eva stubište po odabranim datumima (paralela s mailom/PDF-om).
  const prvaEvaJedinica = await prisma.jedinica.findFirst({
    where: {
      objekt: {
        naziv: {
          contains: "Eva",
        },
      },
    },
    include: {
      objekt: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  });

  if (postavke && prvaEvaJedinica) {
    let d = new Date(danas);

    while (d <= doDatuma) {
      if (evaStubisteZaDan(postavke, d)) {
        planItems.push({
          id: `eva-stubiste-${d.toISOString()}`,
          datum: new Date(d),
          tip: "DODATNO_CISCENJE",
          objekt: prvaEvaJedinica.objekt.naziv,
          jedinica: "Stubište Eva",
          gost: "-",
          brojGostiju: "-",
          opis: "Čišćenje stubišta zajedničkih prostorija",
          sljedeciUlazak: "-",
          brziUlazak: false,
          nemaUplate: false,
        });
      }

      d = addDays(d, 1);
    }
  }

  planItems.sort((a, b) => {
    const datumDiff = a.datum.getTime() - b.datum.getTime();
    if (datumDiff !== 0) return datumDiff;

    const objektDiff = a.objekt.localeCompare(b.objekt);
    if (objektDiff !== 0) return objektDiff;

    return a.jedinica.localeCompare(b.jedinica);
  });

  return (
    <main style={pageStyle}>
      <Link href="/admin" style={backLinkStyle}>
        ← Admin
      </Link>

      <h1 style={{ fontSize: 28, marginBottom: 20 }}>🧼 Čišćenje i plan</h1>

      {params?.saved === "1" && <div style={successStyle}>✅ Spremljeno.</div>}

      {params?.sent === "1" && (
        <div style={successStyle}>
          📧 Mail poslan agenciji i raspored je spremljen.
        </div>
      )}

      {params?.error && (
        <div style={errorStyle}>
          {params.error === "email"
            ? "Email agencije je obavezan."
            : params.error}
        </div>
      )}

      {/* Mobitel: jedan stupac. Od lg: lijevo 580px (postavke), desno popis (1fr). */}
      <div className="grid items-start gap-6 lg:grid-cols-[580px_minmax(0,1fr)]">
        <div style={leftColumnStyle}>
          <form action={spremiPostavke}>
            <div style={cardStyle}>
              <h2>Agencija za čišćenje</h2>

              <label>Naziv</label>
              <input
                name="naziv"
                defaultValue={agencija?.naziv || ""}
                style={inputStyle}
              />

              <label>Email agencije *</label>
              <input
                name="email"
                type="email"
                required
                defaultValue={agencija?.email || ""}
                style={inputStyle}
              />

              <label>CC mailovi</label>
              <input
                name="ccEmails"
                defaultValue={agencija?.ccEmails || ""}
                placeholder="goran@malinska-stay.hr, kristina@malinska-stay.hr, eva@malinska-stay.hr"
                style={inputStyle}
              />

              <label>Telefon</label>
              <input
                name="telefon"
                defaultValue={agencija?.telefon || ""}
                style={inputStyle}
              />
            </div>

            <div style={{ ...cardStyle, marginTop: 18 }}>
              <h2>Automatsko slanje</h2>

              <label style={checkLine}>
                <input
                  type="checkbox"
                  name="aktivno"
                  defaultChecked={postavke?.aktivno ?? true}
                />
                Uključeno
              </label>

              <h3>Dani slanja rasporeda</h3>

              <div style={daysGrid}>
                <Check
                  name="saljiPonedjeljak"
                  label="Ponedjeljak"
                  checked={postavke?.saljiPonedjeljak ?? true}
                />
                <Check
                  name="saljiUtorak"
                  label="Utorak"
                  checked={postavke?.saljiUtorak ?? false}
                />
                <Check
                  name="saljiSrijeda"
                  label="Srijeda"
                  checked={postavke?.saljiSrijeda ?? false}
                />
                <Check
                  name="saljiCetvrtak"
                  label="Četvrtak"
                  checked={postavke?.saljiCetvrtak ?? false}
                />
                <Check
                  name="saljiPetak"
                  label="Petak"
                  checked={postavke?.saljiPetak ?? true}
                />
                <Check
                  name="saljiSubota"
                  label="Subota"
                  checked={postavke?.saljiSubota ?? false}
                />
                <Check
                  name="saljiNedjelja"
                  label="Nedjelja"
                  checked={postavke?.saljiNedjelja ?? false}
                />
              </div>

              <div style={row}>
                <Field
                  name="satSlanja"
                  label="Sat"
                  value={postavke?.satSlanja ?? 8}
                />
                <Field
                  name="minutaSlanja"
                  label="Minuta"
                  value={postavke?.minutaSlanja ?? 0}
                />
                <Field
                  name="brojDanaUnaprijed"
                  label="Dana unaprijed"
                  value={postavke?.brojDanaUnaprijed ?? 7}
                />
              </div>
            </div>

            {/* Dani čišćenja zajedničkih prostora — sada KONKRETNI datumi.
                N kućica = „Dana unaprijed", redom od danas. Svaka kućica dijeli
                isti `name`; value = "YYYY-MM-DD" (formatYMD). */}
            <div style={{ ...cardStyle, marginTop: 18 }}>
              <h2>Bazen Marty</h2>

              <p style={{ color: "#666" }}>
                Označi datume kad se čisti bazen. Ako ne označiš ništa, bazen se
                ne šalje agenciji.
              </p>

              <DatumiGrid
                name="martyBazenDatum"
                datumi={datumiKucice}
                odabrani={postavke?.martyBazenDatumi ?? []}
              />
            </div>

            <div style={{ ...cardStyle, marginTop: 18 }}>
              <h2>Stubište Eva</h2>

              <p style={{ color: "#666" }}>
                Označi datume kad se čisti stubište. Ako ne označiš ništa,
                stubište se ne šalje agenciji.
              </p>

              <DatumiGrid
                name="evaStubisteDatum"
                datumi={datumiKucice}
                odabrani={postavke?.evaStubisteDatumi ?? []}
              />
            </div>

            <div style={{ ...cardStyle, marginTop: 18 }}>
              <h2>Stubište Marty</h2>

              <p style={{ color: "#666" }}>
                Označi datume kad se čisti stubište. Ako ne označiš ništa,
                stubište se ne šalje agenciji.
              </p>

              <DatumiGrid
                name="martyStubisteDatum"
                datumi={datumiKucice}
                odabrani={postavke?.martyStubisteDatumi ?? []}
              />

              <p style={{ color: "#888", fontSize: 13, marginTop: 14 }}>
                Kućice prikazuju narednih {brojDanaKucice} dana (prema polju
                „Dana unaprijed" gore). Promijeniš li broj dana → prvo spremi →
                kućice se osvježe.
              </p>

              <button type="submit" style={buttonStyle}>
                Spremi sve postavke
              </button>
            </div>
          </form>

          <form action={spremiNapomenu}>
            <div id="napomena" style={{ ...cardStyle, marginTop: 18 }}>
              <h2>Napomena agenciji</h2>

              <p style={{ color: "#666", marginTop: 0 }}>
                Šalje se uz sljedeći plan čišćenja. Jednokratna — briše se
                automatski nakon što mail bude poslan.
              </p>

              {params?.napomenaSaved === "1" && (
                <div style={{ ...successStyle, maxWidth: "100%" }}>
                  ✅ Spremljeno.
                </div>
              )}

              <textarea
                name="napomenaAgenciji"
                rows={4}
                defaultValue={postavke?.napomenaAgenciji || ""}
                placeholder="Npr. U apartmanu Eva 2 ostaviti dodatni set ručnika."
                style={textareaStyle}
              />

              <button type="submit" style={buttonStyle}>
                Spremi
              </button>
            </div>
          </form>

          <form action={posaljiOdmah}>
            <button
              style={{
                ...buttonStyle,
                marginTop: 20,
                background: "#0f5132",
                width: "100%",
              }}
            >
              📧 Pošalji odmah raspored za sljedećih{" "}
              {postavke?.brojDanaUnaprijed ?? 7} dana
            </button>
          </form>
        </div>

        <div style={rightColumnStyle}>
          <div style={planCardStyle}>
            <div style={planHeaderStyle}>
              <div>
                <h2 style={{ margin: 0 }}>Plan čišćenja za nas</h2>
                <p style={{ color: "#666", marginTop: 6, marginBottom: 0 }}>
                  Prikaz u stvarnom trenutku iz rezervacija. Ne ovisi o slanju
                  maila. Period: sljedećih {brojDanaZaPlan} dana.
                </p>
              </div>

              <div style={planButtonsStyle}>
                <Link
                  href="/admin/ciscenje?dana=7"
                  style={{
                    ...smallButtonStyle,
                    background: brojDanaZaPlan === 7 ? "#111" : "#eee",
                    color: brojDanaZaPlan === 7 ? "white" : "#111",
                  }}
                >
                  7
                </Link>

                <Link
                  href="/admin/ciscenje?dana=14"
                  style={{
                    ...smallButtonStyle,
                    background: brojDanaZaPlan === 14 ? "#111" : "#eee",
                    color: brojDanaZaPlan === 14 ? "white" : "#111",
                  }}
                >
                  14
                </Link>

                <Link
                  href="/admin/ciscenje?dana=30"
                  style={{
                    ...smallButtonStyle,
                    background: brojDanaZaPlan === 30 ? "#111" : "#eee",
                    color: brojDanaZaPlan === 30 ? "white" : "#111",
                  }}
                >
                  30
                </Link>

                <Link
                  href={`/admin/ciscenje-pdf?dana=${brojDanaZaPlan}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...smallButtonStyle,
                    background: "#0f5132",
                    color: "white",
                  }}
                >
                  Kreiraj PDF
                </Link>
              </div>
            </div>

            <div style={planSummaryStyle}>
              <strong>{planItems.length}</strong> planiranih stavki čišćenja
            </div>

            {planItems.length === 0 ? (
              <div style={emptyPlanStyle}>
                Nema planiranih čišćenja u ovom periodu prema trenutnim
                rezervacijama.
              </div>
            ) : (
              <div style={planListStyle}>
                {planItems.map((z) => {
                  return (
                    <div
                      key={z.id}
                      style={{
                        ...taskCardStyle,
                        border: z.brziUlazak
                          ? "2px solid #b42318"
                          : taskCardStyle.border,
                        background: z.brziUlazak ? "#fff1f1" : "#fafafa",
                      }}
                    >
                      <div style={taskDateStyle}>{formatDatum(z.datum)}</div>

                      <div style={taskObjectStyle}>{z.objekt}</div>

                      <div style={taskUnitStyle}>{z.jedinica}</div>

                      <div style={taskTypeStyle}>{tipLabel(z.tip)}</div>

                      {z.brziUlazak && (
                        <div style={quickBadgeStyle}>
                          ⚠️ BRZI ULAZAK ISTI DAN
                        </div>
                      )}

                      <div style={taskGuestStyle}>
                        Gost: <strong>{z.gost}</strong> · Broj gostiju:{" "}
                        <strong>{z.brojGostiju}</strong>
                      </div>

                      {z.nemaUplate && (
                        <div style={warningBadgeStyle}>
                          ⚠ Provjeri – akontacija nije uplaćena
                        </div>
                      )}

                      <div style={taskOpisStyle}>{z.opis}</div>

                      <div style={nextGuestStyle}>
                        Sljedeći ulazak: <strong>{z.sljedeciUlazak}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Check({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label style={checkLine}>
      <input type="checkbox" name={name} defaultChecked={checked} />
      {label}
    </label>
  );
}

// Mreža kućica za odabir KONKRETNIH datuma čišćenja. Sve kućice dijele isti
// `name` (npr. "martyBazenDatum"), a value je YMD string — server action ih
// pokupi preko formData.getAll(name). Čekirano = datum je u spremljenoj listi.
function DatumiGrid({
  name,
  datumi,
  odabrani,
}: {
  name: string;
  datumi: { value: string; label: string }[];
  odabrani: string[];
}) {
  return (
    <div style={daysGrid}>
      {datumi.map((d) => (
        <label key={d.value} style={checkLine}>
          <input
            type="checkbox"
            name={name}
            value={d.value}
            defaultChecked={odabrani.includes(d.value)}
          />
          {d.label}
        </label>
      ))}
    </div>
  );
}

function Field({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <label>{label}</label>
      <input
        name={name}
        type="number"
        defaultValue={value}
        style={smallInputStyle}
      />
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  // Na mobitelu 12px, na desktopu do 32px — bez media queryja u inline stilovima.
  padding: "clamp(12px, 4vw, 32px)",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  background: "#f5f6f7",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 16,
  color: "#111",
  fontWeight: 700,
  textDecoration: "none",
};

// layoutStyle uklonjen — layout je sada Tailwind grid (vidi gore u JSX-u).

const leftColumnStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 580,
};

const rightColumnStyle: React.CSSProperties = {
  minWidth: 0,
};

const cardStyle: React.CSSProperties = {
  background: "white",
  padding: 20,
  width: "100%",
  maxWidth: 560,
  boxSizing: "border-box",
  border: "1px solid #ddd",
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  marginTop: 4,
  marginBottom: 12,
  border: "1px solid #ccc",
  boxSizing: "border-box",
};

const smallInputStyle: React.CSSProperties = {
  width: 110,
  padding: "9px 10px",
  marginTop: 4,
  border: "1px solid #ccc",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  marginTop: 4,
  marginBottom: 12,
  border: "1px solid #ccc",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 14,
  resize: "vertical",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 18px",
  background: "#111",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const successStyle: React.CSSProperties = {
  background: "#e9f8ee",
  border: "1px solid #bde5c8",
  padding: 12,
  marginBottom: 16,
  width: "100%",
  maxWidth: 560,
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  background: "#fff1f1",
  border: "1px solid #f0b5b5",
  padding: 12,
  marginBottom: 16,
  width: "100%",
  maxWidth: 560,
  boxSizing: "border-box",
};

const checkLine: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 8,
};

const daysGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4,
};

const row: React.CSSProperties = {
  display: "flex",
  gap: 14,
  marginTop: 16,
};

const planCardStyle: React.CSSProperties = {
  background: "white",
  padding: 20,
  border: "1px solid #ddd",
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  minHeight: 520,
};

const planHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const planButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #ccc",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 13,
};

const planSummaryStyle: React.CSSProperties = {
  background: "#eef7f1",
  border: "1px solid #cbe7d3",
  padding: 12,
  marginBottom: 14,
  color: "#0f5132",
};

const emptyPlanStyle: React.CSSProperties = {
  padding: 16,
  background: "#f5f5f5",
  border: "1px solid #ddd",
  color: "#555",
  lineHeight: 1.5,
};

const planListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const taskCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  background: "#fafafa",
  padding: 12,
};

const taskDateStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#777",
  marginBottom: 4,
};

const taskObjectStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 16,
};

const taskUnitStyle: React.CSSProperties = {
  color: "#555",
  marginTop: 2,
};

const taskTypeStyle: React.CSSProperties = {
  marginTop: 8,
  fontWeight: 800,
  color: "#0f5132",
};

const quickBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "5px 8px",
  background: "#b42318",
  color: "white",
  fontWeight: 800,
  fontSize: 12,
};

const warningBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "5px 8px",
  background: "#fff4d6",
  color: "#7a4a0a",
  border: "1px solid #d99c3a",
  fontWeight: 800,
  fontSize: 12,
};

const taskGuestStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#444",
};

const taskOpisStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#555",
  lineHeight: 1.4,
};

const nextGuestStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#111",
  background: "#fff8e1",
  border: "1px solid #ead28b",
  padding: 8,
};