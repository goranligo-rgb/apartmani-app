"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const currentLocale = useLocale() as Locale;
  const pathname = usePathname();
  const t = useTranslations("LanguageSwitcher");

  return (
    <nav
      aria-label={t("label")}
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-black uppercase tracking-[0.1em] ${className}`}
    >
      {routing.locales.map((loc) => {
        const isActive = loc === currentLocale;

        return (
          <Link
            key={loc}
            href={pathname}
            locale={loc}
            hrefLang={loc}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "text-[#caa870] underline underline-offset-4"
                : "text-white/70 hover:text-white"
            }
          >
            {t(loc)}
          </Link>
        );
      })}
    </nav>
  );
}
