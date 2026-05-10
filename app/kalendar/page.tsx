import { prisma } from "@/lib/prisma";
import CalendarClient from "./CalendarClient";

type SearchParams = Promise<{
  month?: string;
}>;

function toLocalIso(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMonth(value?: string) {
  if (!value) return new Date();

  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return new Date();

  return new Date(y, m - 1, 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

function getDaysOfMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const last = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: last }, (_, i) =>
    toLocalIso(new Date(year, month, i + 1))
  );
}

export default async function KalendarPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;

  const currentMonth = parseMonth(searchParams.month);
  const days = getDaysOfMonth(currentMonth);

  const monthLabel = currentMonth.toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = monthKey(addMonths(currentMonth, -1));
  const nextMonth = monthKey(addMonths(currentMonth, 1));

  const jediniceRaw = await prisma.jedinica.findMany({
    where: {
      aktivna: true,
    },
    include: {
      objekt: true,
      cjenici: {
        where: {
          aktivno: true,
        },
        orderBy: {
          datumOd: "asc",
        },
      },
      rezervacije: {
        where: {
          status: {
            not: "OTKAZANO",
          },
          obrisanoAt: null,
        },
        include: {
          gost: true,
        },
        orderBy: {
          datumOd: "asc",
        },
      },
      blokade: {
        where: {
          aktivna: true,
        },
        orderBy: {
          datumOd: "asc",
        },
      },
      blokadeVanjskogKalendara: {
        orderBy: {
          datumOd: "asc",
        },
      },
    },
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
  });

  const dashboardSlikeRaw = await prisma.slikaObjekta.findMany({
    where: {
      aktivna: true,
      prikaziNaDashboardu: true,
      objektId: {
        not: null,
      },
    },
    include: {
      objekt: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  });

  const dashboardSlike = dashboardSlikeRaw.map((s) => ({
    id: s.id,
    url: s.url,
    objektNaziv: s.objekt?.naziv ?? "",
    sortOrder: s.sortOrder,
  }));

  const jedinice = jediniceRaw.map((j) => ({
    id: j.id,
    naziv: j.naziv,
    objektNaziv: j.objekt.naziv,
    osnovniKapacitet: j.osnovniKapacitet,
    dodatniKapacitet: j.dodatniKapacitet,
    brojSpavacihSoba: j.brojSpavacihSoba,
    brojKupaona: j.brojKupaona,

    cjenici: j.cjenici.map((c) => ({
      id: c.id,
      datumOd: toLocalIso(c.datumOd),
      datumDo: toLocalIso(c.datumDo),
      cijenaNocenja: c.cijenaNocenja,
      minimalniBoravak: c.minimalniBoravak,
    })),

    rezervacije: j.rezervacije.map((r) => ({
      id: r.id,
      status: r.status,
      datumOd: toLocalIso(r.datumOd),
      datumDo: toLocalIso(r.datumDo),
      gostIme: r.gost?.ime ?? "",
      gostPrezime: r.gost?.prezime ?? "",
    })),

    blokade: [
      ...j.blokade.map((b) => ({
        id: b.id,
        datumOd: toLocalIso(b.datumOd),
        datumDo: toLocalIso(b.datumDo),
        razlog: b.razlog,
        izvor: b.izvor,
      })),
      ...j.blokadeVanjskogKalendara.map((b) => ({
        id: b.id,
        datumOd: toLocalIso(b.datumOd),
        datumDo: toLocalIso(b.datumDo),
        razlog: b.naslov || "Booking.com",
        izvor: b.izvor || "BOOKING",
      })),
    ],
  }));

  return (
    <CalendarClient
      days={days}
      monthLabel={monthLabel}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      jedinice={jedinice}
      dashboardSlike={dashboardSlike}
    />
  );
}