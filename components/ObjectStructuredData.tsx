import { getTranslations } from "next-intl/server";
import {
  OBJEKTI_PODACI,
  getObjectAmenities,
  type ObjektSlug,
} from "@/lib/objekti";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

// Renders schema.org LodgingBusiness JSON-LD za zadani objekt.
// Description i amenityFeature su lokalizirani po trenutnom locale-u.
export default async function ObjectStructuredData({
  slug,
  locale,
  origin = "https://malinska-stay.hr",
}: {
  slug: ObjektSlug;
  locale: Locale;
  origin?: string;
}) {
  const podaci = OBJEKTI_PODACI[slug];
  const t = await getTranslations({ locale, namespace: `SEOObjekti.${slug}` });
  const amenities = await getObjectAmenities(slug, locale);

  const localizedPath =
    locale === routing.defaultLocale
      ? podaci.canonicalPath
      : `/${locale}${podaci.canonicalPath}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: podaci.punNaziv,
    description: t("description"),
    url: `${origin}${localizedPath}`,
    image: `${origin}${podaci.ogImage}`,
    priceRange: podaci.priceRange,
    address: {
      "@type": "PostalAddress",
      streetAddress: podaci.adresa,
      addressLocality: podaci.mjesto,
      postalCode: podaci.postanskiBroj,
      addressCountry: podaci.drzava,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: podaci.geo.latitude,
      longitude: podaci.geo.longitude,
    },
    amenityFeature: amenities.map((naziv) => ({
      "@type": "LocationFeatureSpecification",
      name: naziv,
      value: true,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // schema podaci kontroliramo mi, nema injection rizika
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
