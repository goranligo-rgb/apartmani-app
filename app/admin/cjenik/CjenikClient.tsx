"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BojaPerioda =
  | "PLAVA"
  | "ZELENA"
  | "ZUTA"
  | "NARANCASTA"
  | "CRVENA"
  | "LJUBICASTA";

type CjenikItem = {
  id: string;
  datumOd: string;
  datumDo: string;
  cijenaNocenja: number;
  minimalniBoravak: number;
  bojaPerioda: BojaPerioda;
  aktivno: boolean;
};

type JedinicaItem = {
  id: string;
  naziv: string;
  objektNaziv: string;
  cjenici: CjenikItem[];
};

function toLocalIso(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIso(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const last = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: last }, (_, i) => new Date(year, month, i + 1));
}

function overlaps(aOd: Date, aDo: Date, bOd: Date, bDo: Date) {
  return aOd <= bDo && aDo >= bOd;
}

function nightsBetween(datumOd: string, datumDo: string) {
  const od = parseIso(datumOd);
  const doDatuma = parseIso(datumDo);

  return Math.round((doDatuma.getTime() - od.getTime()) / 86400000);
}

function bojaStyle(boja: BojaPerioda) {
  switch (boja) {
    case "PLAVA":
      return { bg: "#dceeff", border: "#7fb3e6", text: "#24527a" };
    case "ZELENA":
      return { bg: "#dff3df", border: "#7fb88a", text: "#2f6d36" };
    case "ZUTA":
      return { bg: "#fff1cc", border: "#d4b45a", text: "#8d6513" };
    case "NARANCASTA":
      return { bg: "#ffe0c2", border: "#d88d42", text: "#8a4a0f" };
    case "CRVENA":
      return { bg: "#f8d7da", border: "#d36a74", text: "#8a2d2b" };
    case "LJUBICASTA":
      return { bg: "#ebe8ff", border: "#8d82df", text: "#5647a8" };
  }
}

const BOJE: { value: BojaPerioda; label: string }[] = [
  { value: "PLAVA", label: "Plava" },
  { value: "ZELENA", label: "Zelena" },
  { value: "ZUTA", label: "Žuta" },
  { value: "NARANCASTA", label: "Narančasta" },
  { value: "CRVENA", label: "Crvena" },
  { value: "LJUBICASTA", label: "Ljubičasta" },
];

export default function CjenikClient({ jedinice }: { jedinice: JedinicaItem[] }) {
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(jedinice[0]?.id ?? "");
  const [datumOd, setDatumOd] = useState("");
  const [datumDo, setDatumDo] = useState("");
  const [cijenaNocenja, setCijenaNocenja] = useState("");
  const [minimalniBoravak, setMinimalniBoravak] = useState("2");
  const [bojaPerioda, setBojaPerioda] = useState<BojaPerioda>("ZELENA");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [visibleStartMonth, setVisibleStartMonth] = useState(() =>
    startOfMonth(new Date())
  );

  const selectedJedinica = useMemo(
    () => jedinice.find((j) => j.id === selectedId) ?? null,
    [jedinice, selectedId]
  );

  const months = useMemo(
    () => [0, 1, 2, 3].map((offset) => addMonths(visibleStartMonth, offset)),
    [visibleStartMonth]
  );

  const previewValid =
    !!datumOd &&
    !!datumDo &&
    !!cijenaNocenja &&
    parseIso(datumOd) <= parseIso(datumDo);

  const overlapExists = useMemo(() => {
    if (!selectedJedinica || !previewValid) return false;

    const od = parseIso(datumOd);
    const doDatuma = parseIso(datumDo);

    return selectedJedinica.cjenici.some((c) =>
      overlaps(od, doDatuma, parseIso(c.datumOd), parseIso(c.datumDo))
    );
  }, [selectedJedinica, previewValid, datumOd, datumDo]);

  function prethodniMjesec() {
    setVisibleStartMonth((prev) => addMonths(prev, -1));
  }

  function sljedeciMjesec() {
    setVisibleStartMonth((prev) => addMonths(prev, 1));
  }

  function vratiNaDanas() {
    setVisibleStartMonth(startOfMonth(new Date()));
  }

  function resetSelection() {
    setDatumOd("");
    setDatumDo("");
    setError("");
    setMessage("");
  }

  function handleDayClick(dayIso: string) {
    setError("");
    setMessage("");

    if (!datumOd || (datumOd && datumDo)) {
      setDatumOd(dayIso);
      setDatumDo("");
      return;
    }

    if (dayIso <= datumOd) {
      setDatumOd(dayIso);
      setDatumDo("");
      return;
    }

    setDatumDo(dayIso);
  }

  function isInPreview(dayIso: string) {
    if (!datumOd) return false;
    if (!datumDo) return dayIso === datumOd;

    return dayIso >= datumOd && dayIso <= datumDo;
  }

  function existingForDay(dayIso: string) {
    if (!selectedJedinica) return null;

    return selectedJedinica.cjenici.find((c) => {
      return dayIso >= c.datumOd && dayIso <= c.datumDo;
    });
  }

  async function saveCjenik(mode: "NORMAL" | "SPECIAL") {
    setError("");
    setMessage("");

    if (!selectedId || !datumOd || !datumDo || !cijenaNocenja) {
      setError("Ispuni sva obavezna polja.");
      return;
    }

    if (parseIso(datumOd) > parseIso(datumDo)) {
      setError("Datum od ne može biti nakon datuma do.");
      return;
    }

    if (mode === "NORMAL" && overlapExists) {
      setError(
        "Novi cjenik se preklapa s postojećim periodom. Za rupu koristi gumb Posebna cijena za rupu."
      );
      return;
    }

    if (mode === "SPECIAL" && !overlapExists) {
      setError(
        "Posebna cijena za rupu koristi se samo kada odabrani period ulazi u postojeći cjenik."
      );
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/admin/cjenik", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jedinicaId: selectedId,
          datumOd,
          datumDo,
          cijenaNocenja: Number(cijenaNocenja),
          minimalniBoravak: Number(minimalniBoravak || 2),
          bojaPerioda,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Greška kod spremanja.");
        setIsSaving(false);
        return;
      }

      setMessage(
        mode === "SPECIAL"
          ? "Posebna cijena za rupu je spremljena i postojeći period je razrezan."
          : "Cjenik je spremljen."
      );

      setDatumOd("");
      setDatumDo("");
      setCijenaNocenja("");
      setMinimalniBoravak("2");
      setBojaPerioda("ZELENA");

      router.refresh();
    } catch {
      setError("Došlo je do greške kod spremanja.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveCjenik("NORMAL");
  }

  async function handleDelete(id: string) {
    setError("");
    setMessage("");

    const res = await fetch("/api/admin/cjenik", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Greška kod brisanja.");
      return;
    }

    setMessage("Cjenik je obrisan.");
    router.refresh();
  }

  function cellStyle(dayIso: string) {
    const existing = existingForDay(dayIso);
    const preview = isInPreview(dayIso);

    if (preview && existing) {
      return {
        background: "#f8d7da",
        borderColor: "#d9534f",
        color: "#8a2d2b",
      };
    }

    if (preview) {
      const s = bojaStyle(bojaPerioda);

      return {
        background: s.bg,
        borderColor: s.border,
        color: s.text,
      };
    }

    if (existing) {
      const s = bojaStyle(existing.bojaPerioda);

      return {
        background: s.bg,
        borderColor: s.border,
        color: s.text,
      };
    }

    return {
      background: "#ededed",
      borderColor: "#d4d4d4",
      color: "#666",
    };
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 border border-white/70 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)] md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#9b7a4c]">
            Admin
          </p>

          <h1 className="mt-2 text-4xl font-black text-[#2e2923]">
            Cjenik
          </h1>

          <p className="mt-3 max-w-3xl text-[#6f665a]">
            Upravljanje periodima, cijenama noćenja, minimalnim boravkom i
            posebnim cijenama za rupe u kalendaru.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="cursor-pointer border border-[#d9cfbf] bg-white px-5 py-3 text-sm font-black text-[#2e2923] transition hover:bg-[#f8f3ea]"
          >
            ← Admin dashboard
          </Link>

          <Link
            href="/kalendar"
            className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-3 text-sm font-black text-white transition hover:brightness-95"
          >
            Otvori kalendar →
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
        <section className="border border-white/70 bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
          <h2 className="text-lg font-bold text-[#2e2923]">Novi period</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                Jedinica
              </label>

              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  resetSelection();
                }}
                className="w-full cursor-pointer border border-[#d9cfbf] bg-white px-3 py-2 outline-none"
              >
                {jedinice.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.objektNaziv} — {j.naziv}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                    Od
                  </label>

                  <input
                    type="text"
                    value={datumOd}
                    readOnly
                    className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-3 py-2 outline-none"
                    placeholder="klik u kalendaru"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                    Do
                  </label>

                  <input
                    type="text"
                    value={datumDo}
                    readOnly
                    className="w-full border border-[#d9cfbf] bg-[#f8f3ea] px-3 py-2 outline-none"
                    placeholder="klik u kalendaru"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                  Cijena / noć (€)
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={cijenaNocenja}
                  onChange={(e) => setCijenaNocenja(e.target.value)}
                  className="w-full border border-[#d9cfbf] px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                  Minimalni boravak
                </label>

                <input
                  type="number"
                  min={1}
                  value={minimalniBoravak}
                  onChange={(e) => setMinimalniBoravak(e.target.value)}
                  className="w-full border border-[#d9cfbf] px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#2e2923]">
                  Boja perioda
                </label>

                <select
                  value={bojaPerioda}
                  onChange={(e) => setBojaPerioda(e.target.value as BojaPerioda)}
                  className="w-full cursor-pointer border border-[#d9cfbf] bg-white px-3 py-2 outline-none"
                >
                  {BOJE.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {previewValid && (
                <div className="border border-[#e7dece] bg-[#fcfaf6] p-3 text-sm text-[#5f5549]">
                  <div>
                    <b>Period:</b> {datumOd} — {datumDo}
                  </div>

                  <div>
                    <b>Dana u rasponu:</b> {nightsBetween(datumOd, datumDo) + 1}
                  </div>

                  <div>
                    <b>Cijena:</b> € {Number(cijenaNocenja).toFixed(2)}
                  </div>

                  <div>
                    <b>Minimalni boravak:</b> {minimalniBoravak} noći
                  </div>

                  <div>
                    <b>Status:</b>{" "}
                    {overlapExists
                      ? "Preklapanje — možeš koristiti Posebnu cijenu za rupu"
                      : "Ispravan novi period"}
                  </div>
                </div>
              )}

              {error && (
                <div className="border border-[#f0c3c1] bg-[#f8d7da] p-3 text-[#8a2d2b]">
                  {error}
                </div>
              )}

              {message && (
                <div className="border border-[#cfe5d0] bg-[#dff3df] p-3 text-[#2f6d36]">
                  {message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isSaving || overlapExists}
                  className="cursor-pointer border border-[#caa870] bg-[#c79a57] px-5 py-2 font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Spremam..." : "Spremi"}
                </button>

                <button
                  type="button"
                  disabled={isSaving || !previewValid || !overlapExists}
                  onClick={() => saveCjenik("SPECIAL")}
                  className="cursor-pointer border border-[#8a4a0f] bg-[#ffe0c2] px-4 py-2 font-bold text-[#8a4a0f] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Posebna cijena za rupu
                </button>

                <button
                  type="button"
                  onClick={resetSelection}
                  className="cursor-pointer border border-[#d9cfbf] bg-white px-4 py-2 font-semibold text-[#2e2923] transition hover:bg-[#f8f3ea]"
                >
                  Poništi
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 border border-[#e7dece] bg-[#fcfaf6] p-4">
            <div className="mb-3 text-sm font-bold text-[#2e2923]">
              Legenda
            </div>

            <div className="space-y-2 text-sm text-[#5f5549]">
              {BOJE.map((b) => {
                const s = bojaStyle(b.value);

                return (
                  <div key={b.value} className="flex items-center gap-3">
                    <span
                      className="inline-block h-5 w-5 border"
                      style={{ background: s.bg, borderColor: s.border }}
                    />
                    {b.label} — posebna cijena
                  </div>
                );
              })}

              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-5 w-5 border"
                  style={{ background: "#ededed", borderColor: "#d4d4d4" }}
                />
                Rupa bez cijene
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-5 w-5 border"
                  style={{ background: "#f8d7da", borderColor: "#d9534f" }}
                />
                Preklapanje / rupa u postojećem cjeniku
              </div>
            </div>
          </div>
        </section>

        <section className="border border-white/70 bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#2e2923]">
                Pregled 4 mjeseca — {selectedJedinica?.objektNaziv} /{" "}
                {selectedJedinica?.naziv}
              </h2>

              <p className="mt-1 text-sm text-[#6f665a]">
                Klikni prvi datum za početak, drugi za kraj. Ako odabrani period
                ulazi u postojeći cjenik, koristi gumb Posebna cijena za rupu.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={prethodniMjesec}
                className="cursor-pointer border border-[#d9cfbf] bg-white px-4 py-2 text-lg font-black text-[#2e2923] transition hover:bg-[#f8f3ea]"
                title="Prethodni mjesec"
              >
                ←
              </button>

              <button
                type="button"
                onClick={vratiNaDanas}
                className="cursor-pointer border border-[#d9cfbf] bg-[#fcfaf6] px-4 py-2 text-sm font-bold text-[#2e2923] transition hover:bg-[#f8f3ea]"
              >
                Danas
              </button>

              <button
                type="button"
                onClick={sljedeciMjesec}
                className="cursor-pointer border border-[#d9cfbf] bg-white px-4 py-2 text-lg font-black text-[#2e2923] transition hover:bg-[#f8f3ea]"
                title="Sljedeći mjesec"
              >
                →
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {months.map((monthDate) => {
              const days = daysInMonth(monthDate);

              return (
                <div
                  key={monthDate.toISOString()}
                  className="border border-[#e7dece] bg-[#fcfaf6] p-3"
                >
                  <div className="mb-3 text-sm font-bold uppercase tracking-wide text-[#7d6f60]">
                    {monthDate.toLocaleDateString("hr-HR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>

                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
                  >
                    {["Po", "Ut", "Sr", "Če", "Pe", "Su", "Ne"].map((d) => (
                      <div
                        key={d}
                        className="p-1 text-center text-[11px] font-bold text-[#8b7d6b]"
                      >
                        {d}
                      </div>
                    ))}

                    {Array.from({
                      length:
                        (new Date(
                          monthDate.getFullYear(),
                          monthDate.getMonth(),
                          1
                        ).getDay() +
                          6) %
                        7,
                    }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}

                    {days.map((day) => {
                      const iso = toLocalIso(day);
                      const style = cellStyle(iso);
                      const existing = existingForDay(iso);

                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => handleDayClick(iso)}
                          className="min-h-[34px] cursor-pointer border text-[11px] font-semibold transition hover:brightness-95"
                          style={style}
                          title={
                            existing
                              ? `${iso} • €${existing.cijenaNocenja} • min ${existing.minimalniBoravak} noći`
                              : iso
                          }
                        >
                          <div>{day.getDate()}</div>

                          {existing && (
                            <div className="text-[9px]">
                              €{existing.cijenaNocenja}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-base font-bold text-[#2e2923]">
              Postojeći periodi
            </h3>

            {!selectedJedinica?.cjenici.length ? (
              <div className="border border-[#e7dece] bg-[#fcfaf6] p-4 text-[#756a5f]">
                Nema unesenog cjenika.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedJedinica.cjenici.map((c) => {
                  const s = bojaStyle(c.bojaPerioda);

                  return (
                    <div
                      key={c.id}
                      className="border p-3"
                      style={{ background: s.bg, borderColor: s.border }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-[#2e2923]">
                            {parseIso(c.datumOd).toLocaleDateString("hr-HR")} —{" "}
                            {parseIso(c.datumDo).toLocaleDateString("hr-HR")}
                          </div>

                          <div className="mt-1 text-sm text-[#5f5549]">
                            € {c.cijenaNocenja.toFixed(2)} / noć
                          </div>

                          <div className="mt-1 text-xs text-[#6f665a]">
                            Minimalni boravak: {c.minimalniBoravak} noći •
                            Boja: {c.bojaPerioda}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="cursor-pointer border border-[#d6c9b8] bg-white px-3 py-2 font-semibold text-[#7a4d32] transition hover:bg-[#f7efe3]"
                        >
                          Obriši
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}