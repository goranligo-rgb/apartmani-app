import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://malinska-stay.hr"),
  title: {
    default: "Malinska Stay – Apartmani na Krku",
    template: "%s | Malinska Stay",
  },
  description:
    "Apartmani u Malinskoj na otoku Krku – direktna rezervacija u Apartments Eva, Luxury Apartments Marty i House Art. Bez provizija, blizu mora i centra Malinske.",
  keywords: [
    "apartmani Malinska",
    "smještaj Krk",
    "apartmani Krk",
    "Malinska smještaj",
    "Apartments Eva",
    "Luxury Apartments Marty",
    "House Art Malinska",
  ],
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "hr_HR",
    url: "https://malinska-stay.hr",
    siteName: "Malinska Stay",
    title: "Malinska Stay – Apartmani na Krku",
    description:
      "Apartmani u Malinskoj na otoku Krku – direktna rezervacija u Apartments Eva, Luxury Apartments Marty i House Art.",
    images: [
      {
        url: "/images/hero1.jpg",
        width: 1200,
        height: 630,
        alt: "Malinska Stay – Malinska, otok Krk",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Malinska Stay – Apartmani na Krku",
    description:
      "Apartmani u Malinskoj na otoku Krku – direktna rezervacija.",
    images: ["/images/hero1.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "EMgX1z0L6kDDvSXlArJgdpqwgYZwnTZ3wypI2amIh2Q",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
