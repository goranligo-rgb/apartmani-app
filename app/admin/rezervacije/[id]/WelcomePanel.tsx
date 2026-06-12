"use client";

// Welcome mail panel s HR/EN/DE prekidačem — popravak iste klase buga kao kod
// SMS-a (SmsPanel): prije su jezik (dropdown) i uvod-textarea bili NEOVISNI, pa
// se slao hrvatski uvod u njemački mail. Sada klik na jezik TRENUTNO presloži
// uvod-textarea na `uvodovi[jezik]` (server pripremi sva 3 unaprijed) I postavi
// skriveni `jezik` koji ide server-akciji. Akcija je NEPROMIJENJENA — i dalje
// čita `jezik` + `uvodPara`. Uvod ostaje editabilan.

import { useState } from "react";

type Jezik = "hr" | "en" | "de";

const LABELE: Record<Jezik, string> = { hr: "HR", en: "EN", de: "DE" };
const REDOSLIJED: Jezik[] = ["hr", "en", "de"];

export function WelcomePanel({
  uvodovi,
  defaultJezik,
  rezervacijaId,
  imaEmail,
  imaWelcomeSlug,
  posalji,
}: {
  uvodovi: Record<Jezik, string>;
  defaultJezik: Jezik;
  rezervacijaId: string;
  imaEmail: boolean;
  imaWelcomeSlug: boolean;
  posalji: (formData: FormData) => Promise<void>;
}) {
  const [jezik, setJezik] = useState<Jezik>(defaultJezik);
  const [uvod, setUvod] = useState<string>(uvodovi[defaultJezik]);

  // Klik na jezik: zapamti jezik (skriveni input) i RESETIRAJ uvod na taj
  // predložak. (Ručne izmjene uvoda se odbace — smisao prebacivanja jezika.)
  function odaberiJezik(j: Jezik) {
    setJezik(j);
    setUvod(uvodovi[j]);
  }

  const onemoguceno = !imaEmail || !imaWelcomeSlug;

  return (
    <form action={posalji}>
      <input type="hidden" name="rezervacijaId" value={rezervacijaId} />
      {/* Odabrani jezik ide akciji preko skrivenog inputa (zamjena za <select>). */}
      <input type="hidden" name="jezik" value={jezik} />

      <label style={{ display: "block", marginBottom: 8 }}>
        <div className="lm" style={{ marginBottom: 4 }}>
          Jezik
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {REDOSLIJED.map((j) => {
            const aktivan = j === jezik;
            return (
              <button
                key={j}
                type="button"
                onClick={() => odaberiJezik(j)}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: aktivan ? "1px solid #0f5132" : "1px solid #ccc",
                  background: aktivan ? "#0f5132" : "#fff",
                  color: aktivan ? "#fff" : "#333",
                  borderRadius: 4,
                }}
              >
                {LABELE[j]}
              </button>
            );
          })}
        </div>
      </label>

      <label style={{ display: "block", marginBottom: 8 }}>
        <div className="lm" style={{ marginBottom: 4 }}>
          Uvodni tekst (editabilno)
        </div>
        <textarea
          className="in"
          name="uvodPara"
          rows={4}
          value={uvod}
          onChange={(e) => setUvod(e.target.value)}
          style={{ fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </label>

      <div style={{ fontSize: 11, color: "#6f665a", marginBottom: 8 }}>
        Mail nosi cijeli vodič dobrodošlice + šifru (ako postoji) i eCheckin
        link. Šifra se čita s rezervacije, ne generira se.
      </div>

      {!imaEmail && (
        <div
          style={{
            marginBottom: 8,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            padding: "6px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: "#991b1b",
          }}
        >
          Gost nema email adresu — slanje onemogućeno.
        </div>
      )}

      {imaEmail && !imaWelcomeSlug && (
        <div
          style={{
            marginBottom: 8,
            border: "1px solid #ead7b6",
            background: "#fff9ef",
            padding: "6px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: "#7a5a22",
          }}
        >
          Za ovaj objekt ne postoji welcome vodič.
        </div>
      )}

      <button
        className="bg"
        style={{
          width: "100%",
          opacity: onemoguceno ? 0.5 : 1,
          cursor: onemoguceno ? "not-allowed" : "pointer",
        }}
        disabled={onemoguceno}
      >
        Pošalji welcome mail
      </button>
    </form>
  );
}
