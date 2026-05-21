import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

const OG_LOCALE: Record<Locale, string> = {
  hr: "hr_HR",
  en: "en_US",
  de: "de_DE",
  it: "it_IT",
  hu: "hu_HU",
  pl: "pl_PL",
  cs: "cs_CZ",
  sk: "sk_SK",
};

function localizedPath(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) {
    return path === "/" ? "" : path;
  }
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function buildLanguageAlternates(path: string) {
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = localizedPath(loc, path) || "/";
  }
  languages["x-default"] = localizedPath(routing.defaultLocale, path) || "/";
  return languages;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "Meta" });
  const canonical = localizedPath(locale as Locale, "/") || "/";

  return {
    title: {
      default: t("siteTitle"),
      template: `%s | ${t("siteName")}`,
    },
    description: t("siteDescription"),
    alternates: {
      canonical,
      languages: buildLanguageAlternates("/"),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale as Locale],
      url: canonical,
      siteName: t("siteName"),
      title: t("siteTitle"),
      description: t("siteDescription"),
      images: [
        {
          url: "/images/hero1.jpg",
          width: 1200,
          height: 630,
          alt: t("siteTitle"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("siteTitle"),
      description: t("siteDescription"),
      images: ["/images/hero1.jpg"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
