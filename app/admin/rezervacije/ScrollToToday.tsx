"use client";

import { useEffect } from "react";

/**
 * Na mount skrola do razdjelne linije (#sad) na granici prošle/nadolazeće.
 * Renderira se samo kad granica postoji (vidi page.tsx: prikaziGranicu).
 * Radi i na hard refresh i na client-side navigaciju (useEffect na mount).
 */
export default function ScrollToToday() {
  useEffect(() => {
    const el = document.getElementById("sad");
    if (el) {
      el.scrollIntoView({ block: "start" });
    }
  }, []);

  return null;
}
