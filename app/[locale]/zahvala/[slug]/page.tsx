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
import { vodicJezik, type VodicJezik } from "@/lib/vodic";
import { osigurajPoklonBon } from "@/lib/poklonBon";

// Stranica IZDAJE/dohvaća bon (piše u bazu) → eksplicitno dinamično.
// (Welcome je samo-čita pa nema ovu zastavicu — namjerno odstupanje.)
export const dynamic = "force-dynamic";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const SLUGS: ObjektSlug[] = ["eva", "marty", "house-art"];
function isSlug(value: string): value is ObjektSlug {
  return (SLUGS as string[]).includes(value);
}

/* ---------- boje + dizajn (kopirano iz welcome page.tsx, NE importano) ---------- */
const GOLD = "#B9A286";
const GOLD_LINK = "#B9883F";
const SEC_TITLE = "#8B7B63";
const MUTED = "#7a7a7a";

type DekorPos = { src: string; style: CSSProperties };
type Dizajn = {
  boja: string;
  logo: string;
  dekor: DekorPos[];
  logoHeroW: string;
  logoFinalW: string;
  logoHeaderW: string;
  logoFootW: string;
};

const PAGE_PADDING: CSSProperties = {
  paddingBlock: "6.67cqw",
  paddingInline: "9.52cqw",
};
const PAGE_TEXT: CSSProperties = {
  fontSize: "max(1.68cqw, 13px)",
  lineHeight: 1.6,
};

const DIZAJN: Record<ObjektSlug, Dizajn> = {
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

/* ---------- višejezični tekstovi zahvale (lokalno, kao welcome EYEBROW_PERS/HVALA) ---------- */
const DATUM_LOCALE: Record<VodicJezik, string> = {
  hr: "hr-HR",
  en: "en-GB",
  de: "de-DE",
};

const EYEBROW_PERS: Record<VodicJezik, (ime: string) => string> = {
  hr: (ime) => `Dobar dan ${ime},`,
  en: (ime) => `Dear ${ime},`,
  de: (ime) => `Hallo ${ime},`,
};

const ZAHVALA_NASLOV: Record<VodicJezik, string> = {
  hr: "Hvala Vam!",
  en: "Thank you!",
  de: "Vielen Dank!",
};

const ZAHVALA_TEKST: Record<VodicJezik, (naziv: string) => string> = {
  hr: (n) =>
    `Hvala što ste boravili u ${n}. Bilo nam je zadovoljstvo ugostiti Vas.`,
  en: (n) => `Thank you for staying at ${n}. It was our pleasure to host you.`,
  de: (n) =>
    `Vielen Dank für Ihren Aufenthalt im ${n}. Es war uns eine Freude, Sie zu beherbergen.`,
};

const BON_TEKST: Record<
  VodicJezik,
  {
    naslov: string;
    popust: (p: number) => string;
    vrijediDo: string;
    napomena: (ime: string) => string;
  }
> = {
  hr: {
    naslov: "Vaš poklon-bon zahvale",
    popust: (p) => `${p}% popusta na sljedeći boravak`,
    vrijediDo: "Vrijedi do",
    napomena: (ime) =>
      `Bon nije prenosiv. Vrijedi isključivo za vlasnika bona: ${ime}.`,
  },
  en: {
    naslov: "Your thank-you voucher",
    popust: (p) => `${p}% discount on your next stay`,
    vrijediDo: "Valid until",
    napomena: (ime) =>
      `The voucher is non-transferable. Valid only for the voucher holder: ${ime}.`,
  },
  de: {
    naslov: "Ihr Dankeschön-Gutschein",
    popust: (p) => `${p}% Rabatt auf Ihren nächsten Aufenthalt`,
    vrijediDo: "Gültig bis",
    napomena: (ime) =>
      `Der Gutschein ist nicht übertragbar. Gültig nur für den Inhaber: ${ime}.`,
  },
};

const OUTRO: Record<VodicJezik, { gornji: string; naslov: string; potpis: string }> = {
  hr: { gornji: "Radujemo se", naslov: "ponovnom susretu", potpis: "Vaš domaćin" },
  en: {
    gornji: "We look forward to",
    naslov: "welcoming you again",
    potpis: "Your host",
  },
  de: {
    gornji: "Wir freuen uns auf",
    naslov: "Ihren nächsten Besuch",
    potpis: "Ihr Gastgeber",
  },
};

function formatDatum(d: Date, jezik: VodicJezik): string {
  return d.toLocaleDateString(DATUM_LOCALE[jezik], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ---------- Next params/metadata (isto kao welcome) ---------- */
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
    title: `${punNaziv} — Hvala`,
    robots: { index: false, follow: false }, // gost-stranica, ne za SEO
  };
}

export default async function ZahvalaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();
  if (!isSlug(slug)) notFound();

  setRequestLocale(locale);

  const tBack = await getTranslations("Common");
  const jezik = vodicJezik(locale);
  const d = DIZAJN[slug];
  const boja = d.boja;
  const naziv = OBJEKTI_PODACI[slug].punNaziv;

  // Zahvala je U CIJELOSTI personalizirana (bon) — bez valjanog tokena nema
  // sadržaja, pa je notFound() dosljednije od welcome "opće stranice".
  const { t } = await searchParams;
  if (!t) notFound();

  const r = await prisma.rezervacija.findUnique({
    where: { id: t },
    include: { gost: true, jedinica: { include: { objekt: true } } },
  });
  // Ista validacija pripadnosti kao welcome: token mora pripadati ovom objektu.
  if (!r || nazivToSlug(r.jedinica.objekt.naziv) !== slug) notFound();

  // Idempotentno: dohvati postojeći ili izdaj novi bon (lib/poklonBon.ts).
  // Poziva se TEK nakon validacije pripadnosti slugu (gore).
  const bon = await osigurajPoklonBon(r.id);

  const ime = r.gost?.ime || "";
  const bt = BON_TEKST[jezik];
  const outro = OUTRO[jezik];

  return (
    <main
      className={`min-h-screen bg-[#e8e6e2] ${poppins.className}`}
      style={{ color: "#6b6b6b", fontWeight: 300 }}
    >
      {/* Mobilni layout (< 700px): isti pristup kao welcome — A4 omjer postaje
          MINIMUM visine, mijenja se samo bazna veličina fonta. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 699px) {
              .w-list { aspect-ratio: auto !important; overflow: visible !important; }
              .w-inner {
                min-height: calc((100vw - 24px) * 1.4142) !important;
                height: auto !important;
                font-size: 14px !important;
              }
            }
          `,
        }}
      />
      <div className="mx-auto w-full max-w-[820px] px-3 py-7 sm:px-4">
        <Link
          href="/"
          className="mb-5 inline-block text-sm font-medium hover:opacity-70"
          style={{ color: GOLD_LINK }}
        >
          {tBack("back")}
        </Link>

        <div className="space-y-7">
          <Stranica variant="hero" d={d} naziv={naziv}>
            <img
              src={d.logo}
              alt={naziv}
              className="mx-auto"
              style={{ width: d.logoHeroW }}
            />

            {ime && (
              <p
                className="mt-[3em] text-[1.45em] uppercase tracking-[0.35em]"
                style={{ color: GOLD }}
              >
                {EYEBROW_PERS[jezik](ime)}
              </p>
            )}

            <h1
              className="mt-[0.4em] text-[3.3em] font-medium tracking-wide"
              style={{ color: boja }}
            >
              {ZAHVALA_NASLOV[jezik]}
            </h1>

            <p
              className="mx-auto mt-[1.5em] max-w-[80%] text-[1.05em]"
              style={{ color: MUTED }}
            >
              {ZAHVALA_TEKST[jezik](naziv)}
            </p>

            {/* ---- BON kupon ---- */}
            <div
              className="mx-auto mt-[3em] max-w-[80%] rounded-[0.6em]"
              style={{
                border: `1.5px dashed ${GOLD}`,
                background: "#FFFDF9",
                padding: "1.8em 1.6em",
              }}
            >
              <div
                className="text-[1em] uppercase tracking-[0.25em]"
                style={{ color: GOLD }}
              >
                {bt.naslov}
              </div>
              <div
                className="mt-[0.6em] text-[2.6em] font-medium tracking-[0.18em]"
                style={{ color: boja }}
              >
                {bon.kod}
              </div>
              <div className="mt-[0.4em] text-[1.15em]" style={{ color: SEC_TITLE }}>
                {bt.popust(bon.postotakPopusta)}
              </div>
              <div className="mt-[0.9em] text-[1em]" style={{ color: MUTED }}>
                {bt.vrijediDo}:{" "}
                <b className="font-medium" style={{ color: boja }}>
                  {formatDatum(bon.vrijediDo, jezik)}
                </b>
              </div>
              <div
                className="mt-[1em] text-[0.78em]"
                style={{ color: "#9a9a9a" }}
              >
                {bt.napomena(bon.imeVlasnika)}
              </div>
            </div>

            {/* ---- outro ---- */}
            <p className="mt-[3em] text-[1.6em]" style={{ color: GOLD }}>
              {outro.gornji}
            </p>
            <p
              className="mt-[0.2em] text-[2.4em] font-medium"
              style={{ color: boja }}
            >
              {outro.naslov}
            </p>
            <p className="mt-[2em] text-[0.9em]" style={{ color: "#9a9a9a" }}>
              {outro.potpis}
            </p>
          </Stranica>
        </div>
      </div>
    </main>
  );
}

/* ---------- A4 list + dekor (kopirano iz welcome page.tsx, NE importano) ---------- */
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
  const center =
    variant === "content"
      ? "flex flex-col"
      : "flex flex-col items-center justify-center text-center";

  return (
    <section
      className="w-list relative overflow-hidden rounded-sm shadow-md"
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
        className={`w-inner relative z-10 h-full ${center}`}
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
