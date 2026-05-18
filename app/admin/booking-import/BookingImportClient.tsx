"use client";

import { useMemo, useRef, useState } from "react";

type ObjektKey = "EVA" | "MARTY" | "HOUSE_ART";

type DostupniObjekt = {
  key: ObjektKey;
  naziv: string;
};

type JedinicaStatus = "OK" | "NEMA_BLOKADE" | "NEPOZNATA_JEDINICA";
type RowStatus =
  | "OK"
  | "DJELOMICNO"
  | "NEMA_BLOKADE"
  | "NEPOZNATA_JEDINICA"
  | "OTKAZANO"
  | "GRESKA";

type PreviewJedinica = {
  raw: string;
  mapiranNaziv: string | null;
  jedinicaId: string | null;
  blokadaId: string | null;
  status: JedinicaStatus;
};

type PreviewRow = {
  rowIndex: number;
  bookingId: string;
  imeGosta: string;
  nositelj: string;
  datumOd: string | null;
  datumDo: string | null;
  brojNocenja: number | null;
  brojOsoba: number | null;
  iznosBruto: number | null;
  valuta: string;
  drzava: string | null;
  telefon: string | null;
  vrstaJediniceRaw: string;
  jedinice: PreviewJedinica[];
  statusUkupno: RowStatus;
  greska?: string;
};

type ObrisaneRezPreview = {
  id: string;
  datumOd: string;
  datumDo: string;
  gostIme: string;
  iznos: number | null;
};

type PreviewResponse = {
  ok: true;
  objekt: { naziv: string; brojJedinica: number };
  summary: {
    ok: number;
    djelomicno: number;
    nemaBlokade: number;
    nepoznata: number;
    otkazano: number;
    greska: number;
  };
  rows: PreviewRow[];
  obrisaneRezPreview: ObrisaneRezPreview[];
  brojPostojecihZaBrisanje: number;
};

type CommitResponse = {
  ok: true;
  summary: {
    updated: number;
    skipped: number;
    errors: number;
    obrisano: number;
  };
  errors: string[];
};

function statusBoja(s: RowStatus): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (s) {
    case "OK":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        border: "border-emerald-300",
        label: "Spojeno",
      };
    case "DJELOMICNO":
      return {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-300",
        label: "Djelomično",
      };
    case "NEMA_BLOKADE":
      return {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-300",
        label: "Nema iCal blokade",
      };
    case "OTKAZANO":
      return {
        bg: "bg-slate-100",
        text: "text-slate-600",
        border: "border-slate-300",
        label: "Otkazano",
      };
    case "NEPOZNATA_JEDINICA":
      return {
        bg: "bg-rose-50",
        text: "text-rose-800",
        border: "border-rose-300",
        label: "Nepoznata jedinica",
      };
    case "GRESKA":
      return {
        bg: "bg-rose-50",
        text: "text-rose-800",
        border: "border-rose-300",
        label: "Greška",
      };
  }
}

function formatNovac(iznos: number | null, valuta: string): string {
  if (iznos === null) return "—";
  return `${iznos.toFixed(2)} ${valuta}`;
}

export default function BookingImportClient({
  dostupniObjekti,
}: {
  dostupniObjekti: DostupniObjekt[];
}) {
  const [objektKey, setObjektKey] = useState<ObjektKey | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [loading, setLoading] = useState<"idle" | "preview" | "commit">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Counters za "Importiraj" gumb
  const counters = useMemo(() => {
    if (!preview) return { azurirati: 0, djelomicno: 0 };
    let azurirati = 0;
    for (const r of preview.rows) {
      if (r.statusUkupno === "OK" || r.statusUkupno === "DJELOMICNO") {
        azurirati += r.jedinice.filter((j) => j.status === "OK").length;
      }
    }
    return {
      azurirati,
      djelomicno: preview.summary.djelomicno,
    };
  }, [preview]);

  const importDisabled =
    loading !== "idle" || !preview || counters.azurirati === 0;

  function resetPreviewState() {
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }

  function onObjektChange(key: string) {
    setObjektKey(key as ObjektKey | "");
    resetPreviewState();
  }

  function onFileChange(f: File | null) {
    setFile(f);
    resetPreviewState();
  }

  async function ucitajPreview() {
    if (!objektKey || !file) return;
    setLoading("preview");
    setError(null);
    setCommitResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("objektKey", objektKey);

      const res = await fetch("/api/admin/booking-import/preview", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Greška pri učitavanju preview-a.");
        setPreview(null);
        return;
      }

      setPreview(data as PreviewResponse);
    } catch (err) {
      console.error(err);
      setError("Greška u komunikaciji sa serverom.");
    } finally {
      setLoading("idle");
    }
  }

  async function pokreniImport() {
    if (!objektKey || !file || !preview) return;
    const confirmMsg =
      preview.brojPostojecihZaBrisanje > 0
        ? `FULL REPLACE: obrisat će se ${preview.brojPostojecihZaBrisanje} postojećih BOOKING rezervacija (datumOd >= danas), pa kreirati ${counters.azurirati} novih iz Excel-a. Nastavi?`
        : `Importirat ćeš ${counters.azurirati} blokada. Nastavi?`;
    if (!confirm(confirmMsg)) return;

    setLoading("commit");
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("objektKey", objektKey);

      const res = await fetch("/api/admin/booking-import/commit", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Greška pri importu.");
        setCommitResult(null);
        return;
      }

      setCommitResult(data as CommitResponse);
      // Nakon uspješnog importa: resetiramo preview da admin može ponovno ako želi
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      setError("Greška u komunikaciji sa serverom.");
    } finally {
      setLoading("idle");
    }
  }

  return (
    <div className="grid gap-5">
      {/* KARTICA 1 — Konfiguracija */}
      <section className="border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <h2 className="text-xl font-black text-[#2e2923]">
          1. Konfiguracija uvoza
        </h2>
        <p className="mt-1 text-sm text-[#6f665a]">
          Odaberi objekt za koji uvoziš Excel i učitaj datoteku iz Booking
          Extraneta.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
              Objekt
            </label>
            <select
              value={objektKey}
              onChange={(e) => onObjektChange(e.target.value)}
              disabled={loading !== "idle"}
              className="mt-2 w-full border border-[#d8c8aa] bg-white px-3 py-2 text-sm font-semibold text-[#2e2923] disabled:opacity-50"
            >
              <option value="">— Odaberi objekt —</option>
              {dostupniObjekti.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.naziv}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
              Excel datoteka (.xls ili .xlsx)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!objektKey || loading !== "idle"}
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              className="mt-2 w-full border border-[#d8c8aa] bg-white px-3 py-2 text-sm font-semibold text-[#2e2923] disabled:opacity-50"
            />
            {file && (
              <p className="mt-1 text-xs text-[#6f665a]">
                Odabrano: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={ucitajPreview}
            disabled={!objektKey || !file || loading !== "idle"}
            className="cursor-pointer border border-slate-950 bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:text-white"
          >
            {loading === "preview" ? "Učitavanje…" : "Učitaj preview"}
          </button>
        </div>
      </section>

      {/* ERROR BANNER */}
      {error && (
        <div className="border-2 border-rose-300 bg-rose-50 p-4 text-rose-900">
          <strong>Greška:</strong> {error}
        </div>
      )}

      {/* COMMIT RESULT BANNER */}
      {commitResult && (
        <div className="border-2 border-emerald-300 bg-emerald-50 p-5 text-emerald-900">
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            Import gotov
          </p>
          <p className="mt-1 text-lg font-black">
            Obrisano: {commitResult.summary.obrisano} · ažurirano:{" "}
            {commitResult.summary.updated} blokada · preskočeno:{" "}
            {commitResult.summary.skipped}
          </p>
          {commitResult.errors.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-bold">
                Detalji ({commitResult.errors.length})
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {commitResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* FULL REPLACE WARNING BANNER */}
      {preview && preview.brojPostojecihZaBrisanje > 0 && (
        <div className="border-2 border-amber-400 bg-amber-50 p-5 text-amber-900">
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            ⚠ Pažnja — FULL REPLACE
          </p>
          <p className="mt-2 text-base font-bold">
            Ovaj upload će <strong className="text-rose-800">OBRISATI {preview.brojPostojecihZaBrisanje}</strong>{" "}
            postojećih BOOKING rezervacija za <strong>{preview.objekt.naziv}</strong> (datumOd ≥ danas),
            pa <strong className="text-emerald-800">KREIRATI {counters.azurirati}</strong> novih iz Excel-a.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Blokade ostaju netaknute (iCal sync vlasnik). Prošle rezervacije (datumOd &lt; danas) se ne diraju.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-bold">
              Lista rezervacija koje će biti obrisane ({preview.brojPostojecihZaBrisanje})
            </summary>
            <ul className="mt-2 max-h-[300px] overflow-y-auto border border-amber-200 bg-white p-2 font-mono text-xs">
              {preview.obrisaneRezPreview.map((r) => (
                <li key={r.id} className="border-b border-amber-100 py-1 last:border-b-0">
                  <span className="text-[#6f665a]">{r.id.slice(0, 8)}…</span>
                  {" | "}
                  <strong className="text-[#2e2923]">{r.gostIme}</strong>
                  {" | "}
                  {r.datumOd} → {r.datumDo}
                  {" | "}
                  <span className="text-[#9b7a4c]">
                    {r.iznos !== null ? `${r.iznos.toFixed(2)} €` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* PREVIEW TABLICA */}
      {preview && (
        <section className="border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-xl font-black text-[#2e2923]">
            2. Preview ({preview.rows.length} redaka)
          </h2>
          <p className="mt-1 text-sm text-[#6f665a]">
            Objekt: <strong>{preview.objekt.naziv}</strong> ({preview.objekt.brojJedinica} jedinica)
          </p>

          {/* Summary čipovi */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase">
            <Chip label={`${preview.summary.ok} OK`} tone="green" />
            <Chip label={`${preview.summary.djelomicno} djelomično`} tone="amber" />
            <Chip label={`${preview.summary.nemaBlokade} nema blokade`} tone="amber" />
            <Chip label={`${preview.summary.otkazano} otkazano`} tone="slate" />
            <Chip label={`${preview.summary.nepoznata} nepoznata`} tone="rose" />
            <Chip label={`${preview.summary.greska} greška`} tone="rose" />
          </div>

          {/* Tablica */}
          <div className="mt-5 max-h-[600px] overflow-y-auto border border-[#e2d8c8]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[#f8f3ea] text-left">
                <tr className="border-b border-[#e2d8c8]">
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    #
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Booking ID
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Gost
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Datumi
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Cijena
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Jedinice
                  </th>
                  <th className="px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#7a5a22]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const boja = statusBoja(r.statusUkupno);
                  return (
                    <tr
                      key={r.rowIndex}
                      className={`border-b border-[#eee5d0] ${boja.bg}`}
                    >
                      <td className="px-3 py-2 font-semibold text-[#6f665a]">
                        {r.rowIndex}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.bookingId}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-[#2e2923]">
                          {r.nositelj || r.imeGosta || "—"}
                        </div>
                        {r.drzava && (
                          <div className="text-xs text-[#6f665a]">
                            {r.drzava}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.datumOd && r.datumDo ? (
                          <>
                            <div>{r.datumOd}</div>
                            <div className="text-[#6f665a]">→ {r.datumDo}</div>
                            {r.brojNocenja && (
                              <div className="text-[#9b7a4c]">
                                {r.brojNocenja} noći
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-rose-700">neispravan</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatNovac(r.iznosBruto, r.valuta)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.jedinice.length > 0 ? (
                          <ul className="grid gap-0.5">
                            {r.jedinice.map((j, i) => (
                              <li key={i}>
                                <span className="font-semibold">
                                  {j.mapiranNaziv || (
                                    <em className="text-rose-700">
                                      {j.raw}
                                    </em>
                                  )}
                                </span>
                                {j.status !== "OK" && (
                                  <span className="ml-1 text-[#6f665a]">
                                    ({j.status === "NEMA_BLOKADE"
                                      ? "nema blokade"
                                      : "nepoznata"})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[#6f665a]">
                            {r.vrstaJediniceRaw || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block border px-2 py-0.5 text-xs font-black ${boja.bg} ${boja.text} ${boja.border}`}
                        >
                          {boja.label}
                        </span>
                        {r.greska && (
                          <div className="mt-1 text-xs text-rose-700">
                            {r.greska}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* IMPORT GUMB */}
          <div className="mt-6 flex flex-col gap-3 border-t border-[#e2d8c8] pt-5 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-[#6f665a]">
              <strong className="text-[#2e2923]">Importiraj:</strong>{" "}
              <span className="text-emerald-800">
                {counters.azurirati} ažurirati
              </span>
              {" • "}
              <span className="text-amber-800">
                {counters.djelomicno} djelomično
              </span>
              {preview && preview.summary.otkazano > 0 && (
                <>
                  {" • "}
                  <span className="text-slate-500">
                    {preview.summary.otkazano} otkazano (preskačemo)
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={pokreniImport}
              disabled={importDisabled}
              className="cursor-pointer border border-emerald-700 bg-emerald-700 px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-700 disabled:hover:text-white"
            >
              {loading === "commit"
                ? "Importiram…"
                : `Importiraj ${counters.azurirati} blokada`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "slate" | "rose";
}) {
  const styles: Record<typeof tone, string> = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    slate: "bg-slate-100 text-slate-700 border-slate-300",
    rose: "bg-rose-50 text-rose-800 border-rose-300",
  };
  return (
    <span
      className={`border px-2.5 py-1 tracking-[0.08em] ${styles[tone]}`}
    >
      {label}
    </span>
  );
}
