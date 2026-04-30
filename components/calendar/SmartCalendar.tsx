"use client";

import { useMemo, useState } from "react";

type Mode = "PUBLIC" | "ADMIN";

type Interval = {
  od: string;
  do: string;
};

type CjenikItem = {
  datumOd: string | Date;
  datumDo: string | Date;
  cijenaNocenja: number;
};

function toIso(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(d: string | Date) {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return new Date(d + "T00:00:00");
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function isBooked(date: Date, rezervacije: Interval[]) {
  return rezervacije.some((r) => {
    const od = parseDate(r.od);
    const to = parseDate(r.do);
    return date >= od && date < to;
  });
}

function isPast(date: Date) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return date < t;
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const days: Date[] = [];

  const emptyBefore = (first.getDay() + 6) % 7;
  for (let i = 0; i < emptyBefore; i++) {
    days.push(new Date(0));
  }

  let current = new Date(first);
  while (current.getMonth() === month) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function getPriceForDay(day: Date, cjenici: CjenikItem[]) {
  const dayIso = toIso(day);

  const period = cjenici.find((c) => {
    const odIso = toIso(parseDate(c.datumOd));
    const doIso = toIso(parseDate(c.datumDo));
    return dayIso >= odIso && dayIso <= doIso;
  });

  return period?.cijenaNocenja ?? null;
}

export default function SmartCalendar({
  mode,
  rezervacije,
  cjenici = [],
  onSelect,
}: {
  mode: Mode;
  rezervacije: Interval[];
  cjenici?: CjenikItem[];
  onSelect?: (from: Date | null, to: Date | null) => void;
}) {
  const today = new Date();

  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);

  const months = useMemo(() => {
    const list = [];
    for (let i = 0; i < 2; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return list;
  }, []);

  function handleClick(day: Date) {
    if (day.getFullYear() === 1970) return;
    if (isPast(day)) return;

    const booked = isBooked(day, rezervacije);

    if (mode === "PUBLIC" && booked) return;

    if (!from) {
      setFrom(day);
      setTo(null);
      onSelect?.(day, null);
      return;
    }

    if (from && !to) {
      if (day <= from) {
        setFrom(day);
        onSelect?.(day, null);
        return;
      }

      let current = new Date(from);
      while (current < day) {
        if (isBooked(current, rezervacije)) return;
        current.setDate(current.getDate() + 1);
      }

      setTo(day);
      onSelect?.(from, day);
      return;
    }

    setFrom(day);
    setTo(null);
    onSelect?.(day, null);
  }

  function getClass(day: Date) {
    if (day.getFullYear() === 1970) return "bg-transparent";
    if (isPast(day)) return "bg-gray-200 text-gray-400";

    const booked = isBooked(day, rezervacije);

    if (booked) return "bg-red-500 text-white";

    if (from && isSameDay(day, from)) return "bg-green-700 text-white";
    if (to && isSameDay(day, to)) return "bg-green-700 text-white";

    if (from && to && day > from && day < to) return "bg-green-300 text-black";

    return "bg-green-400 hover:bg-green-500 text-black";
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {months.map((m, i) => {
        const days = getMonthDays(m.year, m.month);

        return (
          <div key={i}>
            <h3 className="mb-3 text-lg font-black capitalize">
              {new Date(m.year, m.month).toLocaleString("hr-HR", {
                month: "long",
                year: "numeric",
              })}
            </h3>

            <div className="grid grid-cols-7 gap-1">
              {["Po", "Ut", "Sr", "Če", "Pe", "Su", "Ne"].map((d) => (
                <div key={d} className="text-center text-xs font-black text-black/60">
                  {d}
                </div>
              ))}

              {days.map((day, idx) => {
                const isEmpty = day.getFullYear() === 1970;
                const price = !isEmpty ? getPriceForDay(day, cjenici) : null;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isEmpty}
                    onClick={() => handleClick(day)}
                    className={`min-h-[62px] p-1 text-center text-xs font-bold transition ${getClass(day)}`}
                  >
                    {!isEmpty && (
                      <>
                        <div className="text-sm font-black">{day.getDate()}</div>
                        {price ? (
                          <div className="mt-1 text-[11px] font-black">
                            € {price.toFixed(0)}
                          </div>
                        ) : (
                          <div className="mt-1 text-[10px] opacity-60">—</div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}