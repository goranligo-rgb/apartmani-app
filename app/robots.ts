import type { MetadataRoute } from "next";

const BASE_URL = "https://malinska-stay.hr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/_next/",
        "/kalendar",
        "/jedinice",
        "/posebne-prilike",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
