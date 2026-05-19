import { OBJEKTI_PODACI, type ObjektSlug } from "@/lib/objekti";

// Renders schema.org LodgingBusiness JSON-LD za zadani objekt.
// Koristi statičke podatke iz lib/objekti.ts.
export default function ObjectStructuredData({
  slug,
  origin = "https://malinska-stay.hr",
}: {
  slug: ObjektSlug;
  origin?: string;
}) {
  const podaci = OBJEKTI_PODACI[slug];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: podaci.punNaziv,
    description: podaci.seoDescription,
    url: `${origin}${podaci.canonicalPath}`,
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
    amenityFeature: podaci.amenities.map((naziv) => ({
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
