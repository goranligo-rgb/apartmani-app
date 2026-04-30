"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type CjenikItem = {
  datumOd: string;
  datumDo: string;
  cijenaNocenja: number;
  minimalniBoravak: number;
};

type RezervacijaItem = {
  id: string;
  status: string;
  datumOd: string;
  datumDo: string;
  gostIme: string;
  gostPrezime: string;
};

type BlokadaItem = {
  id: string;
  datumOd: string;
  datumDo: string;
  razlog?: string | null;
  izvor: string;
};

type JedinicaItem = {
  id: string;
  naziv: string;
  objektNaziv: string;
  osnovniKapacitet: number;
  dodatniKapacitet: number;
  brojSpavacihSoba?: number | null;
  brojKupaona?: number | null;
  cjenici: CjenikItem[];
  rezervacije: RezervacijaItem[];
  blokade: BlokadaItem[];
};

const CALENDAR_COLORS = {
  slobodno: "hsl(140, 80%, 60%)",
  slobodnoBorder: "hsl(140, 80%, 35%)",

  zauzeto: "hsl(0, 91%, 55%)",
  zauzetoBorder: "hsl(0, 85%, 35%)",

  odabrano: "#8f7df0",
  odabranoBorder: "#6f5ce0",

  blokirano: "#4b5563",
  blokiranoBorder: "#374151",

  prazno: "#f3f4f6",
  praznoBorder: "#e5e7eb",
};

function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthDays(monthIso: string, offset: number) {
  const [y, m] = monthIso.split("-").map(Number);
  const first = new Date(y, m - 1 + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const last = new Date(year, month + 1, 0).getDate();

  const blanks = (first.getDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: blanks }, () => null);

  for (let i = 1; i <= last; i++) {
    days.push(toIso(new Date(year, month, i)));
  }

  return {
    label: first.toLocaleDateString("hr-HR", {
      month: "long",
      year: "numeric",
    }),
    days,
  };
}

function findCjenik(dayIso: string, cjenici: CjenikItem[]) {
  const day = parseIsoDate(dayIso);

  return cjenici.find((c) => {
    const od = parseIsoDate(c.datumOd);
    const doDatuma = parseIsoDate(c.datumDo);
    return day >= od && day <= doDatuma;
  });
}

function isDayOccupied(dayIso: string, rezervacije: RezervacijaItem[]) {
  const current = parseIsoDate(dayIso);

  return rezervacije.find((r) => {
    if (r.status === "OTKAZANO") return false;

    const start = parseIsoDate(r.datumOd);
    const end = parseIsoDate(r.datumDo);

    return current >= start && current < end;
  });
}

function isCheckoutDay(dayIso: string, rezervacije: RezervacijaItem[]) {
  const current = parseIsoDate(dayIso);

  return rezervacije.find((r) => {
    if (r.status === "OTKAZANO") return false;

    const end = parseIsoDate(r.datumDo);

    return current.getTime() === end.getTime();
  });
}

function isDayBlocked(dayIso: string, blokade: BlokadaItem[]) {
  const current = parseIsoDate(dayIso);

  return blokade.find((b) => {
    const start = parseIsoDate(b.datumOd);
    const end = parseIsoDate(b.datumDo);
    return current >= start && current < end;
  });
}

function getPrice(dayIso: string, cjenici: CjenikItem[]) {
  return findCjenik(dayIso, cjenici)?.cijenaNocenja ?? null;
}

function getMinStay(dayIso: string, cjenici: CjenikItem[]) {
  return findCjenik(dayIso, cjenici)?.minimalniBoravak ?? 2;
}

function nightsBetween(datumOd: string, datumDo: string) {
  const od = parseIsoDate(datumOd);
  const doDatuma = parseIsoDate(datumDo);
  return Math.round((doDatuma.getTime() - od.getTime()) / 86400000);
}

function isSelected(
  dayIso: string,
  selection: { datumOd: string; datumDo?: string } | null
) {
  if (!selection) return false;
  if (selection.datumOd === dayIso) return true;
  if (selection.datumDo === dayIso) return true;
  if (!selection.datumDo) return false;
  return dayIso > selection.datumOd && dayIso < selection.datumDo;
}

function slugFromObjekt(objektNaziv: string) {
  if (objektNaziv === "House Art") return "house-art";
  if (objektNaziv === "Luxury Apartments Marty") return "marty";
  if (objektNaziv === "House Eva") return "eva";
  return "";
}

function objektFromSlug(slug: string | null) {
  if (slug === "house-art") return "House Art";
  if (slug === "marty") return "Luxury Apartments Marty";
  if (slug === "eva") return "House Eva";
  return "";
}

function getHeroImage(objektNaziv: string) {
  if (objektNaziv === "House Art") return "/images/2-malinska.webp";
  if (objektNaziv === "Luxury Apartments Marty") return "/images/3-malinska.webp";
  if (objektNaziv === "House Eva") return "/images/4-malinska.webp";
  return "/images/krk-malinska-hd.jpg";
}

function opisObjekta(objektNaziv: string) {
  if (objektNaziv === "House Art") {
    return "Privatna kuća za obiteljski odmor";
  }

  if (objektNaziv === "Luxury Apartments Marty") {
    return "Apartmani s bazenom u Malinskoj";
  }

  if (objektNaziv === "House Eva") {
    return "Tri apartmana za miran obiteljski odmor";
  }

  return "Smještaj u Malinskoj";
}

export default function CalendarClient({
  prevMonth,
  nextMonth,
  jedinice,
}: {
  prevMonth: string;
  nextMonth: string;
  jedinice: JedinicaItem[];
}) {
  const searchParams = useSearchParams();

  const adminMode = searchParams.get("admin") === "1";
  const currentMonth =
    searchParams.get("month") || new Date().toISOString().slice(0, 7);

  const objekti = Array.from(new Set(jedinice.map((j) => j.objektNaziv)));

  const objektIzUrl = objektFromSlug(searchParams.get("objekt"));
  const pocetniObjekt =
    objektIzUrl && objekti.includes(objektIzUrl)
      ? objektIzUrl
      : objekti[0] || "";

  const [selectedObjekt, setSelectedObjekt] = useState(pocetniObjekt);
  const [selectedJedinicaId, setSelectedJedinicaId] = useState<string | null>(
    null
  );

  const [selection, setSelection] = useState<{
    datumOd: string;
    datumDo?: string;
  } | null>(null);

  const [adminSelection, setAdminSelection] = useState<{
    datumOd: string;
    datumDo?: string;
  } | null>(null);

  const [message, setMessage] = useState("");
  const [isSavingBlock, setIsSavingBlock] = useState(false);

  const objektSlug = slugFromObjekt(selectedObjekt);

  const monthHref = (month: string) => {
    const params = new URLSearchParams();
    params.set("month", month);

    if (objektSlug) params.set("objekt", objektSlug);
    if (adminMode) params.set("admin", "1");

    return `/kalendar?${params.toString()}#kalendar`;
  };

  const filtriraneJedinice = jedinice.filter(
    (j) => j.objektNaziv === selectedObjekt
  );

  const aktivnaJedinica =
    filtriraneJedinice.find((j) => j.id === selectedJedinicaId) ||
    filtriraneJedinice[0];

  const months = useMemo(
    () => [monthDays(currentMonth, 0), monthDays(currentMonth, 1)],
    [currentMonth]
  );

  function hasMissingPriceOrBlockInRange(datumOd: string, datumDo: string) {
    if (!aktivnaJedinica) return true;

    const end = parseIsoDate(datumDo);
    const current = parseIsoDate(datumOd);

    while (current < end) {
      const iso = toIso(current);
      const price = getPrice(iso, aktivnaJedinica.cjenici);
      const booked = isDayOccupied(iso, aktivnaJedinica.rezervacije);
      const blocked = isDayBlocked(iso, aktivnaJedinica.blokade);

      if (!price || booked || blocked) return true;

      current.setDate(current.getDate() + 1);
    }

    return false;
  }

  function hasReservationInAdminRange(datumOd: string, datumDo: string) {
    if (!aktivnaJedinica) return true;

    const end = parseIsoDate(datumDo);
    const current = parseIsoDate(datumOd);

    while (current <= end) {
      const iso = toIso(current);
      const booked = isDayOccupied(iso, aktivnaJedinica.rezervacije);

      if (booked) return true;

      current.setDate(current.getDate() + 1);
    }

    return false;
  }

  function adminRangeMode() {
    if (!adminSelection?.datumOd || !adminSelection?.datumDo || !aktivnaJedinica) {
      return null;
    }

    const startBlocked = isDayBlocked(
      adminSelection.datumOd,
      aktivnaJedinica.blokade
    );

    return startBlocked ? "OPEN" : "CLOSE";
  }

  async function confirmAdminRange() {
    if (!adminSelection?.datumOd || !adminSelection?.datumDo || !aktivnaJedinica) {
      setMessage("Prvo odaberi OD i DO.");
      return;
    }

    if (hasReservationInAdminRange(adminSelection.datumOd, adminSelection.datumDo)) {
      setMessage(
        "Ne možeš zatvoriti ili otvoriti raspon u kojem postoji rezervacija."
      );
      return;
    }

    const mode = adminRangeMode();

    let razlog = "Ručno zatvoreno";

    if (mode === "CLOSE") {
      razlog =
        window.prompt("Razlog zatvaranja termina:", "Ručno zatvoreno") ||
        "Ručno zatvoreno";
    }

    setIsSavingBlock(true);

    const res = await fetch("/api/admin/blokade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jedinicaId: aktivnaJedinica.id,
        datumOd: adminSelection.datumOd,
        datumDo: adminSelection.datumDo,
        razlog,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Greška kod zatvaranja/otvaranja termina.");
      setIsSavingBlock(false);
      return;
    }

    window.location.reload();
  }

  function handleClick(dayIso: string) {
    if (!aktivnaJedinica) return;

    if (adminMode) {
      const booked = isDayOccupied(dayIso, aktivnaJedinica.rezervacije);

      if (booked) {
        setMessage("Rezervirani dan se ne može dirati.");
        return;
      }

      if (!adminSelection || adminSelection.datumDo) {
        setAdminSelection({ datumOd: dayIso });
        setMessage("Odaberi završni datum.");
        return;
      }

      if (dayIso <= adminSelection.datumOd) {
        setAdminSelection({ datumOd: dayIso });
        setMessage("Odaberi završni datum.");
        return;
      }

      setAdminSelection({ ...adminSelection, datumDo: dayIso });
      setMessage("");
      return;
    }

    const price = getPrice(dayIso, aktivnaJedinica.cjenici);
    const booked = isDayOccupied(dayIso, aktivnaJedinica.rezervacije);
    const blocked = isDayBlocked(dayIso, aktivnaJedinica.blokade);

    if (!price || booked || blocked) return;

    if (!selection || selection.datumDo) {
      setSelection({ datumOd: dayIso });
      return;
    }

    if (dayIso <= selection.datumOd) {
      setSelection({ datumOd: dayIso });
      return;
    }

    if (hasMissingPriceOrBlockInRange(selection.datumOd, dayIso)) return;

    setSelection({ ...selection, datumDo: dayIso });
  }

  function totalPrice() {
    if (!selection?.datumDo || !aktivnaJedinica) return 0;

    let total = 0;
    const end = parseIsoDate(selection.datumDo);
    const current = parseIsoDate(selection.datumOd);

    while (current < end) {
      const price = getPrice(toIso(current), aktivnaJedinica.cjenici);
      if (price) total += price;
      current.setDate(current.getDate() + 1);
    }

    return total;
  }

  function selectedMinStay() {
    if (!selection?.datumOd || !aktivnaJedinica) return 2;
    return getMinStay(selection.datumOd, aktivnaJedinica.cjenici);
  }

  function canReserve() {
    if (!selection?.datumDo) return false;

    const nights = nightsBetween(selection.datumOd, selection.datumDo);

    return (
      nights >= selectedMinStay() &&
      !hasMissingPriceOrBlockInRange(selection.datumOd, selection.datumDo)
    );
  }

  function getNaziv(j: JedinicaItem) {
    if (j.objektNaziv === "House Art") return "Cijela kuća";
    if (j.objektNaziv === "Luxury Apartments Marty")
      return `Apartman ${j.naziv.replace("Marty ", "")}`;
    if (j.objektNaziv === "House Eva")
      return `Apartman ${j.naziv.replace("Eva ", "")}`;
    return j.naziv;
  }

  function isUnavailable(dayIso: string) {
    if (!aktivnaJedinica) return true;

    const price = getPrice(dayIso, aktivnaJedinica.cjenici);
    const booked = isDayOccupied(dayIso, aktivnaJedinica.rezervacije);
    const blocked = isDayBlocked(dayIso, aktivnaJedinica.blokade);

    return !price || !!booked || !!blocked;
  }

  function dayStyle(options: {
    booked: RezervacijaItem | undefined;
    blocked: BlokadaItem | undefined;
    price: number | null;
    selected: boolean;
    adminSelected: boolean;
    unavailable: boolean;
    splitCheckout: boolean;
  }) {
    const {
      booked,
      blocked,
      price,
      selected,
      adminSelected,
      unavailable,
      splitCheckout,
    } = options;

    if (splitCheckout) {
      return {
        backgroundColor: "#ffffff",
        borderColor: CALENDAR_COLORS.slobodnoBorder,
        color: "#2e2923",
      };
    }

    if (adminMode) {
      if (booked) {
        return {
          backgroundColor: CALENDAR_COLORS.zauzeto,
          borderColor: CALENDAR_COLORS.zauzetoBorder,
          color: "#ffffff",
        };
      }

      if (adminSelected) {
        return {
          backgroundColor: CALENDAR_COLORS.odabrano,
          borderColor: CALENDAR_COLORS.odabranoBorder,
          color: "#ffffff",
        };
      }

      if (blocked) {
        return {
          backgroundColor: CALENDAR_COLORS.blokirano,
          borderColor: CALENDAR_COLORS.blokiranoBorder,
          color: "#ffffff",
        };
      }

      if (price) {
        return {
          backgroundColor: CALENDAR_COLORS.slobodno,
          borderColor: CALENDAR_COLORS.slobodnoBorder,
          color: "#12351a",
        };
      }

      return {
        backgroundColor: CALENDAR_COLORS.prazno,
        borderColor: CALENDAR_COLORS.praznoBorder,
        color: "#9ca3af",
      };
    }

    if (selected) {
      return {
        backgroundColor: CALENDAR_COLORS.odabrano,
        borderColor: CALENDAR_COLORS.odabranoBorder,
        color: "#ffffff",
      };
    }

    if (unavailable) {
      return {
        backgroundColor: CALENDAR_COLORS.zauzeto,
        borderColor: CALENDAR_COLORS.zauzetoBorder,
        color: "#ffffff",
      };
    }

    return {
      backgroundColor: CALENDAR_COLORS.slobodno,
      borderColor: CALENDAR_COLORS.slobodnoBorder,
      color: "#12351a",
    };
  }

  const selectedAdminMode = adminRangeMode();

  return (
    <main
      className="min-h-screen bg-[#f4efe6] px-4 py-5"
      style={{ fontFamily: "Calibri, Segoe UI, Arial, sans-serif" }}
    >
      <div className="mx-auto max-w-6xl">
        <section className="relative mb-6 min-h-[360px] overflow-hidden border border-white/20 bg-black shadow-[0_22px_70px_rgba(0,0,0,0.25)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('${getHeroImage(selectedObjekt)}')`,
              animation: "heroTravel 28s ease-in-out infinite alternate",
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/10" />

          <div className="relative z-10 flex min-h-[360px] flex-col justify-between p-6 text-white md:p-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.35em] text-[#d6b36a]">
                  Malinska · Otok Krk
                </p>

                <h1 className="mt-4 text-5xl font-black leading-none md:text-7xl">
                  Dostupnost
                </h1>

                <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90">
                  Odaberite objekt, zatim smještajnu jedinicu i provjerite
                  slobodne termine za vaš boravak.
                </p>
              </div>

              <Link
                href={adminMode ? "/admin" : "/"}
                className="cursor-pointer border border-white/40 bg-white/10 px-4 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
              >
                {adminMode ? "← Admin" : "← Početna"}
              </Link>
            </div>

            <div className="max-w-xl border border-white/25 bg-black/35 p-5 backdrop-blur">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#d6b36a]">
                Odabrani objekt
              </div>

              <div className="mt-2 text-3xl font-black">{selectedObjekt}</div>

              <div className="mt-1 text-base text-white/80">
                {opisObjekta(selectedObjekt)}
              </div>
            </div>
          </div>
        </section>

        {adminMode && (
          <div className="mb-4 border border-[#ead8b8] bg-[#fff7e8] p-4 text-sm font-bold text-[#9b6b12]">
            Admin način: klikni OD i DO, provjeri obojani raspon, zatim klikni
            Potvrdi.
          </div>
        )}

        {message && (
          <div className="mb-4 border border-[#f0c3c1] bg-[#f8d7da] p-3 text-sm font-bold text-[#8a2d2b]">
            {message}
          </div>
        )}

        <section className="mb-5 border border-white/70 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#2e2923]">
                Odaberite objekt
              </h2>
              <p className="mt-1 text-sm text-[#6f665a]">
                Nakon odabira objekta prikazuju se dostupne smještajne jedinice.
              </p>
            </div>

            {!adminMode && (
              <div className="flex flex-wrap gap-2 text-sm font-black">
                <span
                  className="px-4 py-2"
                  style={{
                    backgroundColor: CALENDAR_COLORS.slobodno,
                    border: `1px solid ${CALENDAR_COLORS.slobodnoBorder}`,
                    color: "#12351a",
                  }}
                >
                  Slobodno
                </span>

                <span
                  className="px-4 py-2 text-white"
                  style={{
                    backgroundColor: CALENDAR_COLORS.zauzeto,
                    border: `1px solid ${CALENDAR_COLORS.zauzetoBorder}`,
                  }}
                >
                  Zauzeto
                </span>

                <span
                  className="bg-white px-4 py-2 text-[#2e2923]"
                  style={{
                    border: `1px solid ${CALENDAR_COLORS.zauzetoBorder}`,
                  }}
                >
                  Odlazak / slobodno
                </span>

                <span
                  className="px-4 py-2 text-white"
                  style={{
                    backgroundColor: CALENDAR_COLORS.odabrano,
                    border: `1px solid ${CALENDAR_COLORS.odabranoBorder}`,
                  }}
                >
                  Odabrano
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {objekti.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setSelectedObjekt(o);
                  setSelectedJedinicaId(null);
                  setSelection(null);
                  setAdminSelection(null);
                }}
                className={`cursor-pointer border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.12)] ${
                  o === selectedObjekt
                    ? "border-[#c79a57] bg-[#c79a57] text-white"
                    : "border-[#eadfcd] bg-[#fbf8f2] text-[#2e2923]"
                }`}
              >
                <div className="text-xl font-black">{o}</div>
                <div className="mt-2 text-sm opacity-85">{opisObjekta(o)}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtriraneJedinice.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => {
                setSelectedJedinicaId(j.id);
                setSelection(null);
                setAdminSelection(null);
              }}
              className={`cursor-pointer border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.12)] ${
                j.id === aktivnaJedinica?.id
                  ? "border-[#0b252b] bg-[#0b252b] text-white"
                  : "border-white/70 bg-white text-[#2e2923]"
              }`}
            >
              <div className="text-lg font-black">{getNaziv(j)}</div>

              <div className="mt-4 space-y-1 text-sm font-bold opacity-90">
                <div>
                  Kapacitet: {j.osnovniKapacitet}
                  {j.dodatniKapacitet ? ` + ${j.dodatniKapacitet}` : ""} osoba
                </div>
                <div>Spavaće sobe: {j.brojSpavacihSoba ?? "-"}</div>
                <div>Kupaone: {j.brojKupaona ?? "-"}</div>
              </div>
            </button>
          ))}
        </section>

        {adminMode && adminSelection && (
          <div className="mb-4 border border-[#d9cfbf] bg-white p-4 text-sm shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <div className="font-bold text-[#2e2923]">
              Odabrano: {adminSelection.datumOd}
              {adminSelection.datumDo
                ? ` — ${adminSelection.datumDo}`
                : " — odaberi DO"}
            </div>

            {adminSelection.datumDo && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmAdminRange}
                  disabled={isSavingBlock}
                  className={`cursor-pointer px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedAdminMode === "OPEN" ? "bg-gray-700" : "bg-[#c79a57]"
                  }`}
                >
                  {isSavingBlock
                    ? "Spremam..."
                    : selectedAdminMode === "OPEN"
                    ? "Potvrdi otvaranje"
                    : "Potvrdi zatvaranje"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAdminSelection(null);
                    setMessage("");
                  }}
                  className="cursor-pointer border border-[#d9cfbf] bg-white px-4 py-2 font-bold text-[#2e2923]"
                >
                  Poništi
                </button>
              </div>
            )}
          </div>
        )}

        <div id="kalendar" className="scroll-mt-6 grid gap-4 lg:grid-cols-2">
          {months.map((month, monthIndex) => (
            <div
              key={month.label}
              className="border border-white/70 bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
            >
              <div className="mb-4 grid grid-cols-[48px_1fr_48px] items-center">
                {monthIndex === 0 ? (
                  <Link
                    href={monthHref(prevMonth)}
                    className="cursor-pointer border border-[#d9cfbf] bg-[#f4efe6] px-2 py-2 text-center text-lg font-black transition hover:bg-[#efe1cc]"
                  >
                    ←
                  </Link>
                ) : (
                  <div />
                )}

                <h2 className="text-center text-lg font-black uppercase tracking-wide text-[#2e2923]">
                  {month.label}
                </h2>

                {monthIndex === 1 ? (
                  <Link
                    href={monthHref(nextMonth)}
                    className="cursor-pointer border border-[#d9cfbf] bg-[#f4efe6] px-2 py-2 text-center text-lg font-black transition hover:bg-[#efe1cc]"
                  >
                    →
                  </Link>
                ) : (
                  <div />
                )}
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-black text-[#7b7165]">
                {["Po", "Ut", "Sr", "Če", "Pe", "Su", "Ne"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {month.days.map((dayIso, idx) => {
                  if (!dayIso) return <div key={idx} />;

                  const booked = isDayOccupied(
                    dayIso,
                    aktivnaJedinica.rezervacije
                  );
                  const checkout = isCheckoutDay(
                    dayIso,
                    aktivnaJedinica.rezervacije
                  );
                  const blocked = isDayBlocked(
                    dayIso,
                    aktivnaJedinica.blokade
                  );
                  const price = getPrice(dayIso, aktivnaJedinica.cjenici);
                  const selected = isSelected(dayIso, selection);
                  const adminSelected = isSelected(dayIso, adminSelection);
                  const unavailable = isUnavailable(dayIso);

                  const splitCheckout =
                    !!checkout &&
                    !booked &&
                    !blocked &&
                    !!price &&
                    !selected &&
                    !adminSelected;

                  const title = adminMode
                    ? booked
                      ? `Rezervirano: ${booked.gostIme} ${booked.gostPrezime}`
                      : checkout
                      ? `Odlazak: ${checkout.gostIme} ${checkout.gostPrezime} • slobodno za novi ulazak • €${price}`
                      : blocked
                      ? `Zatvoreno: ${blocked.razlog || blocked.izvor}`
                      : price
                      ? `Slobodno • €${price}`
                      : "Nema cijene"
                    : booked
                    ? "Zauzeto"
                    : checkout && price
                    ? `Odlazak gosta • slobodno za novi ulazak • €${price}`
                    : unavailable
                    ? "Zauzeto"
                    : `Slobodno • €${price}`;

                  const style = dayStyle({
                    booked,
                    blocked,
                    price,
                    selected,
                    adminSelected,
                    unavailable,
                    splitCheckout,
                  });

                  return (
                    <button
                      key={dayIso}
                      type="button"
                      disabled={!!booked || (!adminMode && unavailable)}
                      onClick={() => handleClick(dayIso)}
                      title={title}
                      className="relative h-13 min-h-[52px] cursor-pointer overflow-hidden border text-xs font-black transition hover:brightness-95 disabled:cursor-not-allowed"
                      style={style}
                    >
                      {splitCheckout && (
                        <>
                          <span
                            className="absolute inset-0"
                            style={{
                              backgroundColor: CALENDAR_COLORS.zauzeto,
                              clipPath: "polygon(0 0, 0 100%, 100% 0)",
                            }}
                          />
                          <span
                            className="absolute inset-0"
                            style={{
                              backgroundColor: CALENDAR_COLORS.slobodno,
                              clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                            }}
                          />
                        </>
                      )}

                      <div className="relative z-10">{dayIso.slice(-2)}</div>

                      <div className="relative z-10 text-[10px]">
                        {adminMode
                          ? booked
                            ? "REZ"
                            : blocked
                            ? "ZAT"
                            : price
                            ? `€${price}`
                            : "-"
                          : booked
                          ? "Zauzeto"
                          : price
                          ? `€${price}`
                          : "-"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!adminMode && selection?.datumDo && (
          <section className="mt-5 border border-[#e4d6c0] bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-[#9b7a4c]">
                  Odabrani termin
                </div>

                <div className="mt-2 text-2xl font-black text-[#2e2923]">
                  {selection.datumOd} — {selection.datumDo}
                </div>

                <div className="mt-2 text-sm text-[#6f665a]">
                  Noći: {nightsBetween(selection.datumOd, selection.datumDo)} ·
                  minimalni boravak: {selectedMinStay()} noći
                </div>
              </div>

              <div className="text-left md:text-right">
                <div className="text-sm font-bold text-[#6f665a]">Ukupno</div>

                <div className="text-4xl font-black text-[#2e2923]">
                  € {totalPrice()}
                </div>
              </div>
            </div>

            {canReserve() ? (
              <Link
                href={`/rezervacije/nova?jedinicaId=${aktivnaJedinica.id}&datumOd=${selection.datumOd}&datumDo=${selection.datumDo}&iznosUkupno=${totalPrice()}`}
                className="mt-5 inline-block cursor-pointer bg-[#c79a57] px-6 py-3 font-black text-white transition hover:brightness-95"
              >
                REZERVIRAJ
              </Link>
            ) : (
              <div className="mt-5 inline-block bg-gray-300 px-6 py-3 font-black text-gray-600">
                NEDOVOLJNO NOĆI
              </div>
            )}
          </section>
        )}
      </div>

      <style>{`
        @keyframes heroTravel {
          0% {
            transform: scale(1.08) translateX(-1.5%);
            background-position: center center;
          }
          50% {
            transform: scale(1.14) translateX(1.5%);
            background-position: 58% center;
          }
          100% {
            transform: scale(1.1) translateX(-1%);
            background-position: 45% center;
          }
        }
      `}</style>
    </main>
  );
}