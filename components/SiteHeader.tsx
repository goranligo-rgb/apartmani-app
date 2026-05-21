import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

const NAV_OBJEKTI = [
  { slug: "house-art", key: "houseArt", href: "/objekti/house-art" },
  { slug: "marty", key: "marty", href: "/objekti/marty" },
  { slug: "eva", key: "eva", href: "/objekti/eva" },
] as const;

export default async function SiteHeader() {
  const t = await getTranslations("Header");
  const tHome = await getTranslations("Home.objekti");

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-[#071e24]/95 text-white backdrop-blur">
      <div className="relative h-[78px] border-b border-white/10 md:flex md:h-[88px] md:items-center md:justify-between">
        <div className="absolute left-3 top-[58px] flex items-center gap-2 md:static md:order-2 md:mr-0 md:flex md:shrink-0 md:gap-0">
          <Link
            href="/posebne-prilike"
            className="posebne-btn flex h-[38px] w-[68px] items-center justify-center whitespace-pre-line rounded-[4px] border border-white/10 px-2 text-center text-[8px] font-black uppercase leading-tight text-white shadow-[0_8px_22px_rgba(0,0,0,0.28)] md:h-[88px] md:w-[160px] md:rounded-none md:text-sm"
          >
            {t("specialOffers")}
          </Link>

          <Link
            href="/kalendar"
            className="flex h-[38px] w-[58px] items-center justify-center whitespace-pre-line rounded-[4px] bg-[#c79a57] px-2 text-center text-[8px] font-black uppercase leading-tight text-white shadow-[0_8px_22px_rgba(0,0,0,0.28)] transition hover:brightness-95 md:h-[88px] md:w-[150px] md:rounded-none md:text-sm"
          >
            {t("bookNow")}
          </Link>
        </div>

        <Link
          href="/"
          className="absolute right-3 top-4 flex min-w-0 items-center text-right md:static md:order-1 md:h-[88px] md:flex-1 md:px-8 md:text-left"
        >
          <div className="min-w-0">
            <div className="text-[19px] font-black leading-none tracking-[0.12em] md:text-[30px] md:tracking-[0.16em]">
              MALINSKA
            </div>

            <div className="mt-1 text-[8px] uppercase leading-tight tracking-[0.18em] text-[#caa870] md:mt-2 md:text-xs md:tracking-[0.28em]">
              {t("brandSubtitle")}
            </div>
          </div>
        </Link>
      </div>

      <div className="border-b border-white/10 px-3 py-1.5 md:px-8 md:py-2">
        <LanguageSwitcher />
      </div>

      <div className="grid grid-cols-3 text-center text-[15px] font-black uppercase tracking-[0.04em] md:tracking-wide md:text-lg">
        {NAV_OBJEKTI.map((o) => (
          <Link
            key={o.slug}
            href={o.href}
            className="flex min-h-[64px] items-center justify-center border-r border-white/10 bg-[#071e24]/95 px-1.5 py-2 leading-tight transition hover:bg-white/10 md:min-h-[64px] md:px-3 md:py-2"
          >
            <span className="md:hidden">{tHome(`${o.key}.nazivMobile`)}</span>
            <span className="hidden md:inline">{tHome(`${o.key}.naziv`)}</span>
          </Link>
        ))}
      </div>
    </header>
  );
}
