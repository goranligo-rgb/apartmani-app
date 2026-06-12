"use client";

// Ručni SMS panel s HR/EN/DE prekidačem (situacija A: admin je prisutan i bira
// jezik). Predispun = jezik koji bi i cron izabrao (server proslijedi
// `defaultJezik` iz rezerviraniJezik). Klik na drugi jezik TRENUTNO presloži
// textarea na `textovi[jezik]` (bez reloada); textarea ostaje editabilna i
// šalje se server-akciji pod imenom "tekst" (akcija NEPROMIJENJENA).

import { useState } from "react";

type Jezik = "hr" | "en" | "de";

const LABELE: Record<Jezik, string> = { hr: "HR", en: "EN", de: "DE" };
const REDOSLIJED: Jezik[] = ["hr", "en", "de"];

export function SmsPanel({
  textovi,
  defaultJezik,
  rezervacijaId,
  infobokOk,
  imaSifru,
  posalji,
}: {
  textovi: Record<Jezik, string>;
  defaultJezik: Jezik;
  rezervacijaId: string;
  infobokOk: boolean;
  imaSifru: boolean;
  posalji: (formData: FormData) => Promise<void>;
}) {
  const [jezik, setJezik] = useState<Jezik>(defaultJezik);
  const [tekst, setTekst] = useState<string>(textovi[defaultJezik]);

  // Klik na jezik: zapamti odabir i RESETIRAJ textarea na taj predložak.
  // (Eventualne ručne izmjene se odbace — to je i smisao prebacivanja jezika.)
  function odaberiJezik(j: Jezik) {
    setJezik(j);
    setTekst(textovi[j]);
  }

  const onemoguceno = !infobokOk || !imaSifru;

  return (
    <form action={posalji}>
      <input type="hidden" name="rezervacijaId" value={rezervacijaId} />

      {/* Prekidač jezika */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
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

      <label style={{ display: "block", marginBottom: 8 }}>
        <div className="lm" style={{ marginBottom: 4 }}>
          Tekst SMS-a (editabilno)
        </div>
        <textarea
          className="in"
          name="tekst"
          rows={7}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          style={{ fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </label>

      {!infobokOk && (
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
          Infobip nije konfiguriran — slanje onemogućeno.
        </div>
      )}

      {infobokOk && !imaSifru && (
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
          Nema generirane šifre — prvo je spremi u TTLock pristupu.
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
        Pošalji SMS
      </button>
    </form>
  );
}
