import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Poppins } from "next/font/google";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { OBJEKTI_PODACI, nazivToSlug, type ObjektSlug } from "@/lib/objekti";
import {
  dohvatiVodic,
  vodicJezik,
  type IkonaKljuc,
  type VodicJezik,
  type VodicKartica,
  type VodicLink,
  type VodicSekcija,
} from "@/lib/vodic";
import { dohvatiPrijevode } from "@/lib/mailovi";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const SLUGS: ObjektSlug[] = ["eva", "marty", "house-art"];

function isSlug(value: string): value is ObjektSlug {
  return (SLUGS as string[]).includes(value);
}

// Zlatni / neutralni tokeni (isti za sve objekte, prema dizajn-referenci).
const GOLD = "#B9A286"; // eyebrow / tag / banner
const GOLD_LINK = "#B9883F"; // tekstualni linkovi
const ICON = "#A4937B"; // ikone sekcija
const SEC_TITLE = "#8B7B63"; // naslov sekcije
const LINE = "#C9B697"; // tanka linija ispod naslova
const MUTED = "#7a7a7a";

// Per-objekt dizajn. Dekoracije, margine i logoi izraženi su u POSTOCIMA
// dimenzija .page lista, izračunato iz mm vrijednosti u dizajn-referenci
// (A4 = 210×297mm): horizontalno mm/210, vertikalno mm/297. Time web list
// drži iste proporcije kao PDF stranica na bilo kojoj veličini ekrana.
type DekorPos = { src: string; style: CSSProperties };
type Dizajn = {
  boja: string;
  logo: string;
  dekor: DekorPos[];
  logoHeroW: string; // hero (naslovnica)
  logoFinalW: string; // završna
  logoHeaderW: string; // zaglavlje sadržajnih listova
  logoFootW: string; // podnožje
};

// Padding sadržaja iz reference (≈14–16mm / 20mm) izražen u cqw (postotak širine
// lista) — isti omjer kao u PDF-u na svakoj veličini ekrana.
const PAGE_PADDING: CSSProperties = {
  paddingBlock: "6.67cqw",
  paddingInline: "9.52cqw",
};

// Bazni font lista = body 10pt iz reference (10pt = 3.53mm → 3.53/210 = 1.68cqw),
// uz donju granicu čitljivosti na uskim ekranima. Sve ostalo skalira u `em`
// relativno na ovu bazu, pa prijelom redaka prati PDF.
const PAGE_TEXT: CSSProperties = {
  fontSize: "max(1.68cqw, 13px)",
  lineHeight: 1.6,
};

const DIZAJN: Record<ObjektSlug, Dizajn> = {
  // eva_vodic_v2.html: tl 26mm; r top88mm/27mm; bl bottom60mm/25mm; br 25mm.
  // logoi: head 40mm, hero 80mm, final 64mm, foot 14mm.
  eva: {
    boja: "#2A4B7C",
    logo: "/vodic/logos/eva_logo.png",
    dekor: [
      { src: "cvijet_tl", style: { top: 0, left: 0, width: "12.4%" } },
      { src: "cvijet_r", style: { top: "29.6%", right: 0, width: "12.9%" } },
      { src: "cvijet_bl", style: { bottom: "20.2%", left: 0, width: "11.9%" } },
      { src: "cvijet_br", style: { bottom: 0, right: 0, width: "11.9%" } },
    ],
    logoHeroW: "38.1%",
    logoFinalW: "30.5%",
    logoHeaderW: "19%",
    logoFootW: "6.7%",
  },
  // marty_vodic.html: br right5mm/bottom5mm/36mm. logoi: head 60mm, hero 120mm, final 96mm, foot 21mm.
  marty: {
    boja: "#6A572B",
    logo: "/vodic/logos/marty_logo.png",
    dekor: [
      { src: "ivy_br", style: { bottom: "1.7%", right: "2.4%", width: "17.1%" } },
    ],
    logoHeroW: "57.1%",
    logoFinalW: "45.7%",
    logoHeaderW: "28.6%",
    logoFootW: "10%",
  },
  // house_art_vodic.html: tr right0/top60mm/33mm; bl left0/bottom0/46mm. logoi kao marty.
  "house-art": {
    boja: "#34349B",
    logo: "/vodic/logos/house-art_logo.png",
    dekor: [
      { src: "splash_tr", style: { top: "20.2%", right: 0, width: "15.7%" } },
      { src: "splash_bl", style: { bottom: 0, left: 0, width: "21.9%" } },
    ],
    logoHeroW: "57.1%",
    logoFinalW: "45.7%",
    logoHeaderW: "28.6%",
    logoFootW: "10%",
  },
};

// Personalizirani prikaz (uz ?t=): labele i format datuma po jeziku vodiča.
const DATUM_LOCALE: Record<VodicJezik, string> = {
  hr: "hr-HR",
  en: "en-GB",
  de: "de-DE",
};
const DATUM_LABELE: Record<VodicJezik, { dolazak: string; odjava: string }> = {
  hr: { dolazak: "Dolazak", odjava: "Odjava" },
  en: { dolazak: "Arrival", odjava: "Departure" },
  de: { dolazak: "Anreise", odjava: "Abreise" },
};

// Personalizirani eyebrow (CSS radi uppercase). Bez t → ostaje vodic.hero.eyebrow.
// Personaliziran pozdrav u eyebrowu (CSS radi uppercase). HR "Dobar dan" je
// rodno neutralno; EN/DE zadržavaju svoje.
const EYEBROW_PERS: Record<VodicJezik, (ime: string) => string> = {
  hr: (ime) => `Dobar dan ${ime},`,
  en: (ime) => `Dear ${ime},`,
  de: (ime) => `Hallo ${ime},`,
};

// Rečenica zahvale na početku uvodnog odlomka (uz ?t=). Završava zarezom jer se
// nastavlja u uvodni odlomak (dob.uvodPara počinje malim slovom: "radujemo se…").
const HVALA: Record<VodicJezik, (naziv: string) => string> = {
  hr: (naziv) => `Hvala što ste odabrali ${naziv}, `,
  en: (naziv) => `Thank you for choosing ${naziv}, `,
  de: (naziv) => `Vielen Dank, dass Sie sich für ${naziv} entschieden haben, `,
};

function formatDatum(d: Date, jezik: VodicJezik): string {
  return d.toLocaleDateString(DATUM_LOCALE[jezik], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    SLUGS.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return {};
  const punNaziv = OBJEKTI_PODACI[slug].punNaziv;
  return {
    title: `${punNaziv} — Welcome`,
    robots: { index: false, follow: false }, // gost-vodič, ne za SEO
  };
}

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ t?: string; uvod?: string }>;
}) {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();
  if (!isSlug(slug)) notFound();

  setRequestLocale(locale);

  const tBack = await getTranslations("Common");
  const vodic = dohvatiVodic(slug, locale);
  const jezik = vodicJezik(locale);
  const d = DIZAJN[slug];
  const boja = d.boja;
  const naziv = vodic.punNaziv;

  // Personalizirani prikaz: ?t={rezervacijaId}. Šifra se SAMO ČITA s rezervacije
  // (TTLock se ne dira). Validira se da rezervacija pripada objektu iz sluga;
  // inače se t ignorira i prikazuje opća stranica. Prisma upit → dinamički render.
  const { t, uvod } = await searchParams;
  let pers: {
    ime: string;
    sifra: string | null;
    eCheckinLink: string | null;
    datumOd: Date;
    datumDo: Date;
  } | null = null;

  if (t) {
    const r = await prisma.rezervacija.findUnique({
      where: { id: t },
      include: {
        gost: true,
        jedinica: { include: { objekt: true } },
        ttlockSifre: { orderBy: { createdAt: "asc" } },
      },
    });
    if (r && nazivToSlug(r.jedinica.objekt.naziv) === slug) {
      pers = {
        ime: r.gost?.ime || "",
        sifra: r.ttlockSifre[0]?.sifra || null,
        eCheckinLink: r.eCheckinLink || null,
        datumOd: r.datumOd,
        datumDo: r.datumDo,
      };
    }
  }

  const dob = dohvatiPrijevode(locale).dobrodoslica;
  const datLab = DATUM_LABELE[jezik];
  // Uvodni odlomak: override (?uvod= iz admin maila) ako postoji, inače standardni.
  // Render je čisti tekst (React escape, bez dangerouslySetInnerHTML); uz to
  // ograničavamo duljinu — predugačak override (> 600 zn.) se ignorira.
  const UVOD_MAX = 600;
  const uvodCist = uvod?.trim();
  const uvodPara =
    uvodCist && uvodCist.length <= UVOD_MAX ? uvodCist : dob.uvodPara;

  // Sekcije razvrstane na "listove" kao u PDF-u.
  const byBroj = (n: number) => vodic.sekcije.find((s) => s.broj === n);
  const kontakti = byBroj(1);
  const pravila = byBroj(2);
  const pergola = vodic.sekcije.find((s) => s.tip === "pergola");
  const plaze = byBroj(4);
  const gastro = byBroj(5);
  const krk = byBroj(6);
  const transport = byBroj(7);
  const otpad = byBroj(8);

  return (
    <main
      className={`min-h-screen bg-[#e8e6e2] ${poppins.className}`}
      style={{ color: "#6b6b6b", fontWeight: 300 }}
    >
      <div className="mx-auto w-full max-w-[820px] px-3 py-7 sm:px-4">
        <Link
          href="/"
          className="mb-5 inline-block text-sm font-medium hover:opacity-70"
          style={{ color: GOLD_LINK }}
        >
          {tBack("back")}
        </Link>

        <div className="space-y-7">
          {/* 1 — HERO / naslovnica */}
          <Stranica variant="hero" d={d} naziv={naziv}>
            <img src={d.logo} alt={naziv} className="mx-auto" style={{ width: d.logoHeroW }} />
            <p
              className="mt-[4em] text-[1.45em] uppercase tracking-[0.35em]"
              style={{ color: GOLD }}
            >
              {pers && pers.ime
                ? EYEBROW_PERS[jezik](pers.ime)
                : vodic.hero.eyebrow}
            </p>
            <h1
              className="mt-[0.4em] text-[3.3em] font-medium tracking-wide"
              style={{ color: boja }}
            >
              {vodic.hero.naslov}
            </h1>
            <p className="mx-auto mt-[3em] max-w-[80%] text-[1.05em]" style={{ color: MUTED }}>
              {pers ? `${HVALA[jezik](naziv)}${uvodPara} ` : ""}
              {vodic.hero.uvod}
            </p>

            {/* Personalizirano (uz ?t=) — isti diskretni format kao WiFi, bez okvira */}
            {pers && (
              <div className="mt-[3em] space-y-[0.3em] text-[1.1em]" style={{ color: MUTED }}>
                {pers.sifra && (
                  <>
                    <div>
                      {dob.sifraUvod}:{" "}
                      <b className="font-medium" style={{ color: boja }}>
                        *{pers.sifra}#
                      </b>
                    </div>
                    <div className="text-[0.7em]" style={{ color: "#9a9a9a" }}>
                      {dob.sifraNapomena}
                    </div>
                  </>
                )}
                {pers.eCheckinLink && (
                  <div className="mt-[0.9em]">
                    {dob.eCheckinUvod}{" "}
                    <b className="font-medium" style={{ color: boja }}>
                      <a
                        href={pers.eCheckinLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: boja, textDecoration: "none" }}
                      >
                        {pers.eCheckinLink.replace(/^https?:\/\//, "")}
                      </a>
                    </b>
                  </div>
                )}
                <div className="mt-[0.9em]">
                  {datLab.dolazak}:{" "}
                  <b className="font-medium" style={{ color: boja }}>
                    {formatDatum(pers.datumOd, jezik)}
                  </b>
                  {" · "}
                  {datLab.odjava}:{" "}
                  <b className="font-medium" style={{ color: boja }}>
                    {formatDatum(pers.datumDo, jezik)}
                  </b>
                </div>
              </div>
            )}

            <div className="mt-[3em] space-y-[0.3em] text-[1.1em]" style={{ color: MUTED }}>
              <div>
                {vodic.wifi.mrezaLabela} (Wi-Fi):{" "}
                <b className="font-medium" style={{ color: boja }}>
                  {vodic.wifi.mreza}
                </b>
              </div>
              <div>
                {vodic.wifi.lozinkaLabela}:{" "}
                <b className="font-medium" style={{ color: boja }}>
                  {vodic.wifi.lozinka}
                </b>
              </div>
            </div>
          </Stranica>

          {/* 2 — Kontakti + Kućni red */}
          <Stranica d={d} naziv={naziv}>
            {kontakti && <Sekcija sekcija={kontakti} boja={boja} />}
            {pravila && <Sekcija sekcija={pravila} boja={boja} />}
          </Stranica>

          {/* 2b — Pergola (samo Marty) */}
          {pergola && (
            <Stranica d={d} naziv={naziv}>
              <Sekcija sekcija={pergola} boja={boja} />
            </Stranica>
          )}

          {/* 3 — Plaže + Gastronomija */}
          <Stranica d={d} naziv={naziv}>
            {plaze && <Sekcija sekcija={plaze} boja={boja} />}
            {gastro && <Sekcija sekcija={gastro} boja={boja} />}
          </Stranica>

          {/* 4 — Što posjetiti + Transport + Komunalne usluge */}
          <Stranica d={d} naziv={naziv}>
            {krk && <Sekcija sekcija={krk} boja={boja} />}
            {transport && <Sekcija sekcija={transport} boja={boja} />}
            {otpad && <Sekcija sekcija={otpad} boja={boja} />}
          </Stranica>

          {/* 5 — Završna */}
          <Stranica variant="final" d={d} naziv={naziv}>
            <img src={d.logo} alt={naziv} className="mx-auto mb-[2em]" style={{ width: d.logoFinalW }} />
            <p className="text-[1.6em]" style={{ color: GOLD }}>
              {vodic.outro.gornji}
            </p>
            <p
              className="mt-[0.3em] text-[2.8em] font-medium"
              style={{ color: boja }}
            >
              {vodic.outro.naslov}
            </p>
            <p className="mt-[2.5em] text-[0.9em]" style={{ color: "#9a9a9a" }}>
              {vodic.outro.potpis}
            </p>
          </Stranica>
        </div>
      </div>
    </main>
  );
}

/* ---------- list (PDF-style stranica) ---------- */
function Dekor({ d }: { d: Dizajn }) {
  return (
    <>
      {d.dekor.map((dek) => (
        <img
          key={dek.src}
          src={`/vodic/dekor/${dek.src}.png`}
          alt=""
          aria-hidden
          className="pointer-events-none absolute z-0 select-none opacity-90"
          style={dek.style}
        />
      ))}
    </>
  );
}

function HeaderLogo({ d, naziv }: { d: Dizajn; naziv: string }) {
  return (
    <div className="mb-[2.5em] text-center">
      <img src={d.logo} alt={naziv} className="mx-auto" style={{ width: d.logoHeaderW }} />
    </div>
  );
}

function Podnozje({ d, naziv }: { d: Dizajn; naziv: string }) {
  return (
    <div className="mt-[3em] flex items-center gap-[0.6em]">
      <img src={d.logo} alt="" aria-hidden style={{ width: d.logoFootW }} />
      <span className="h-px flex-1" style={{ background: `${d.boja}80` }} />
      <span
        className="text-[0.8em] uppercase tracking-[0.25em]"
        style={{ color: d.boja }}
      >
        {naziv}
      </span>
    </div>
  );
}

function Stranica({
  variant = "content",
  d,
  naziv,
  children,
}: {
  variant?: "hero" | "final" | "content";
  d: Dizajn;
  naziv: string;
  children: ReactNode;
}) {
  // hero/final: sadržaj vertikalno centriran unutar A4 lista.
  // content: zaglavlje gore, sekcije rastu (flex-1), podnožje na dnu.
  const center =
    variant === "content"
      ? "flex flex-col"
      : "flex flex-col items-center justify-center text-center";

  return (
    <section
      className="relative overflow-hidden rounded-sm shadow-md"
      // Fiksni A4 format (210×297) — visina = 141.4% širine, kao pravi list.
      // container-type → cqw jedinice djece skaliraju prema širini lista.
      style={{
        aspectRatio: "210 / 297",
        containerType: "inline-size",
        backgroundColor: "#FCFBFA",
        backgroundImage: "url('/vodic/eva_assets/tekstura_light.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Dekor d={d} />
      <div
        className={`relative z-10 h-full ${center}`}
        style={{ ...PAGE_PADDING, ...PAGE_TEXT }}
      >
        {variant === "content" ? (
          <>
            <HeaderLogo d={d} naziv={naziv} />
            <div className="flex-1 space-y-[2.55em]">{children}</div>
            <Podnozje d={d} naziv={naziv} />
          </>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/* ---------- bold segmenti (**tekst** → <b> u boji objekta) ---------- */
function bold(text: string, boja: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((dio, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-medium" style={{ color: boja }}>
        {dio}
      </b>
    ) : (
      dio
    )
  );
}

/* ---------- ikone ---------- */
function Ikona({ kljuc }: { kljuc: IkonaKljuc }) {
  const common = { width: "1.55em", height: "1.55em", viewBox: "0 0 24 24" as const };
  if (kljuc === "telefon") {
    return (
      <svg {...common} fill={ICON} aria-hidden>
        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
      </svg>
    );
  }
  if (kljuc === "pin") {
    return (
      <svg {...common} fill={ICON} aria-hidden>
        <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
      </svg>
    );
  }
  if (kljuc === "vilica") {
    return (
      <svg {...common} fill={ICON} aria-hidden>
        <path d="M8.1 13.3L9.5 12 3.7 6.2c-1.2 1.2-1.2 3.1 0 4.2l4.4 2.9zm5.4-1.4c1.1.5 2.7.2 3.9-1 1.4-1.4 1.7-3.4.6-4.5-1.1-1.1-3.1-.8-4.5.6-1.2 1.2-1.5 2.8-1 3.9L2.9 20.4l1.4 1.4 7.6-7.5 7.6 7.5 1.4-1.4-7.5-7.6 .1-.9z" />
      </svg>
    );
  }
  if (kljuc === "pergola") {
    return (
      <svg {...common} fill="none" stroke={ICON} strokeWidth={2} aria-hidden>
        <path d="M3 10l9-6 9 6" />
        <line x1="5" y1="10" x2="5" y2="20" />
        <line x1="19" y1="10" x2="19" y2="20" />
        <line x1="5" y1="14" x2="19" y2="14" />
      </svg>
    );
  }
  // info
  return (
    <svg {...common} fill="none" stroke={ICON} strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10" x2="12" y2="17" />
      <circle cx="12" cy="7" r="0.5" fill={ICON} />
    </svg>
  );
}

function Zaglavlje({ ikona, naslov }: { ikona: IkonaKljuc; naslov: string }) {
  return (
    <>
      <div className="flex items-center gap-[0.7em]">
        <Ikona kljuc={ikona} />
        <h2
          className="text-[1.55em] font-normal tracking-wide"
          style={{ color: SEC_TITLE }}
        >
          {naslov}
        </h2>
      </div>
      <div className="mb-[1.42em] mt-[0.3em] h-px" style={{ background: LINE }} />
    </>
  );
}

function Linkovi({ kartica }: { kartica: VodicKartica }) {
  const svi = kartica.linkovi ?? (kartica.link ? [kartica.link] : []);
  if (svi.length === 0) return null;
  return (
    <div className="mt-[0.4em] flex flex-wrap gap-x-[1em] gap-y-[0.3em]">
      {svi.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="text-[0.86em] hover:underline"
          style={{ color: GOLD_LINK }}
        >
          {l.tekst}
        </a>
      ))}
    </div>
  );
}

function Stavka({ kartica, boja }: { kartica: VodicKartica; boja: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-[0.5em]">
        <span className="text-[1.05em] font-medium" style={{ color: SEC_TITLE }}>
          {kartica.naziv}
        </span>
        {kartica.badge && (
          <span
            className="rounded px-[0.6em] py-[0.15em] text-[0.68em] font-medium uppercase tracking-[0.12em] text-white"
            style={{ background: GOLD }}
          >
            {kartica.badge}
          </span>
        )}
      </div>
      {kartica.opis && (
        <p className="mt-[0.4em] text-[0.9em]" style={{ color: "#8d8d8d" }}>
          {bold(kartica.opis, boja)}
        </p>
      )}
      {kartica.opisRedovi && (
        <div
          className="mt-[0.4em] flex flex-col gap-y-[0.74em] text-[0.9em]"
          style={{ color: "#8d8d8d" }}
        >
          {kartica.opisRedovi.map((r, i) => (
            <span key={i}>{bold(r, boja)}</span>
          ))}
        </div>
      )}
      <Linkovi kartica={kartica} />
    </div>
  );
}

function Sekcija({ sekcija, boja }: { sekcija: VodicSekcija; boja: string }) {
  if (sekcija.tip === "kontakti") {
    return (
      <section>
        <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
        <div className="space-y-[0.62em]">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-[1em]">
            <span style={{ color: "#A4937B" }} className="sm:w-[17.5em]">
              {sekcija.domacica.labela} {sekcija.domacica.ime}
            </span>
            <a
              href={`tel:${sekcija.domacica.telefon.replace(/\s/g, "")}`}
              className="font-medium"
              style={{ color: boja }}
            >
              {sekcija.domacica.telefon}
            </a>
            <span className="text-[0.85em]" style={{ color: "#b0b0b0" }}>
              {sekcija.domacica.kanali}
            </span>
          </div>
          {sekcija.hitni.map((h) => (
            <div key={h.naziv} className="flex gap-[1em]">
              <span className="sm:w-[17.5em]" style={{ color: "#A4937B" }}>
                {h.naziv}
              </span>
              <span style={{ color: "#5d5d5d" }}>{h.broj}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (sekcija.tip === "pravila") {
    return (
      <section>
        <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
        <div className="space-y-[0.74em]">
          {sekcija.stavke.map((p, i) => (
            <p key={i} style={{ color: MUTED }}>
              {bold(p, boja)}
            </p>
          ))}
        </div>
      </section>
    );
  }

  if (sekcija.tip === "pergola") {
    return (
      <section>
        <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
        <div className="space-y-[0.74em]">
          {sekcija.odlomci.map((p, i) => (
            <p key={i} style={{ color: MUTED }}>
              {bold(p, boja)}
            </p>
          ))}
        </div>
        <div className="mt-[2em] text-center">
          <img
            src={sekcija.slika}
            alt=""
            className="mx-auto rounded-lg"
            style={{ width: "45.7%" }}
          />
        </div>
      </section>
    );
  }

  if (sekcija.tip === "otpad") {
    return (
      <section>
        <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
        <p className="text-[0.88em]" style={{ color: MUTED }}>
          {sekcija.uvod}
        </p>
        <div className="mt-[0.6em] flex flex-col gap-y-[0.74em]">
          {sekcija.vrste.map((v) => (
            <span
              key={v.naziv}
              className="inline-flex items-center gap-[0.5em] text-[0.88em]"
              style={{ color: MUTED }}
            >
              <i
                className="inline-block h-[0.85em] w-[0.85em] shrink-0 rounded-full"
                style={{ background: v.boja }}
              />
              {v.naziv}
            </span>
          ))}
        </div>
        <p className="mt-[0.6em] text-[0.88em]" style={{ color: MUTED }}>
          {sekcija.napomena}
        </p>
        <a
          href={sekcija.link.url}
          target="_blank"
          rel="noreferrer"
          className="mt-[0.6em] inline-block text-[0.86em] hover:underline"
          style={{ color: GOLD_LINK }}
        >
          {sekcija.link.tekst}
        </a>
      </section>
    );
  }

  // Gastronomija (5): Restorani → zlatni banner → Naša preporuka.
  if (sekcija.broj === 5) {
    const [prva, ...ostatak] = sekcija.kartice;
    return (
      <section>
        <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
        {prva && <Stavka kartica={prva} boja={boja} />}
        {sekcija.link && <Banner link={sekcija.link} className="my-[1.4em]" />}
        <div className="space-y-[1.02em]">
          {ostatak.map((k, i) => (
            <Stavka key={i} kartica={k} boja={boja} />
          ))}
        </div>
      </section>
    );
  }

  // Ostale "kartice" sekcije. Plaže (4) = jedan stupac (.stavke u referenci).
  // Izleti (6) i transport (7) = dva stupca (.dvostupac), da stranica 4 stane
  // na jedan A4 kao u PDF-u.
  const dvostupac = sekcija.broj === 6 || sekcija.broj === 7;
  return (
    <section>
      <Zaglavlje ikona={sekcija.ikona} naslov={sekcija.naslov} />
      <div
        className={
          dvostupac
            ? "grid grid-cols-2 gap-x-[3.4em] gap-y-[1.02em]"
            : "space-y-[1.02em]"
        }
      >
        {sekcija.kartice.map((k, i) => (
          <Stavka key={i} kartica={k} boja={boja} />
        ))}
      </div>
      {sekcija.link && <Banner link={sekcija.link} className="mt-[1.4em]" />}
    </section>
  );
}

function Banner({ link, className }: { link: VodicLink; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={`inline-block rounded-md px-[2.4em] py-[0.5em] text-[0.85em] font-medium uppercase tracking-[0.12em] text-white hover:opacity-90 ${className ?? ""}`}
      style={{ background: GOLD }}
    >
      {link.tekst}
    </a>
  );
}
