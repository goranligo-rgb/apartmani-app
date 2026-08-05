"use client";

// Gumb "Provjeri uplatu i potvrdi" — jedina zaštita od duplog submita.
//
// Incident: dva klika u razmaku od 4 sekunde napravila su DVA računa
// (MARTY-035-2026 i MARTY-036-2026) nad istim Placanjem. Obrada iza gumba
// (Stripe capture + PDF + mail) traje više sekundi, a stranica se cijelo to
// vrijeme ne mijenja jer redirect stiže tek na kraju — pa admin klikne opet.
//
// Zašto client komponenta oko cijele <form>, a ne nešto manje:
//   • useFormStatus NE radi ovdje — forma gađa URL (`action="/api/..."`,
//     native POST), a ne server akciju, pa React tu submisiju ne prati i
//     `pending` bi uvijek bio false.
//   • `disabled` postavljen u onClick samog submit gumba zna OTKAZATI native
//     submit (React na diskretnom eventu flusha state prije default akcije,
//     a onemogućen submitter prekida slanje). Brava zato sjedi na onSubmit.
//
// Dvije razine brave:
//   • useRef — sinkrona, odbija drugi submit odmah, i prije re-rendera;
//   • useState — samo vizualno (tekst + disabled), za sporiji dupli klik.
//
// Ovo je zaštita SAMO za jedan tab. Dva taba, ručni retry ili ponovno slanje
// POST-a i dalje prolaze — za to je potrebna serverska idempotencija.

import { useEffect, useRef, useState } from "react";

export function PotvrdiUplatuForm({ placanjeId }: { placanjeId: string }) {
  const [obrada, setObrada] = useState(false);
  const poslanoRef = useRef(false);

  // Povratak preko "Natrag" vraća stranicu iz bfcachea u zatečenom stanju —
  // bez ovoga bi gumb ostao trajno onemogućen. `event.persisted` je true samo
  // kod bfcache restorea, pa se normalan render ne dira.
  useEffect(() => {
    function naPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        poslanoRef.current = false;
        setObrada(false);
      }
    }

    window.addEventListener("pageshow", naPageShow);
    return () => window.removeEventListener("pageshow", naPageShow);
  }, []);

  return (
    <form
      action="/api/admin/placanja/potvrdi-link"
      method="POST"
      onSubmit={(e) => {
        if (poslanoRef.current) {
          e.preventDefault();
          return;
        }

        poslanoRef.current = true;
        setObrada(true);
      }}
    >
      <input type="hidden" name="placanjeId" value={placanjeId} />
      <button
        type="submit"
        disabled={obrada}
        style={{
          background: "#15803d",
          color: "#fff",
          border: "1px solid #15803d",
          padding: "5px 10px",
          fontSize: 11,
          fontWeight: 600,
          cursor: obrada ? "not-allowed" : "pointer",
          opacity: obrada ? 0.6 : 1,
        }}
      >
        {obrada ? "⏳ Obrada…" : "✅ Provjeri uplatu i potvrdi"}
      </button>

      <div style={{ marginTop: 4, fontSize: 10, color: "#6f665a", maxWidth: 220 }}>
        Naplata i slanje računa traju nekoliko sekundi.
      </div>
    </form>
  );
}
