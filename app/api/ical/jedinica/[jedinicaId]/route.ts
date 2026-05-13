import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    jedinicaId: string;
  }>;
};

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function fmtStamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { jedinicaId } = await params;

  const jedinica = await prisma.jedinica.findUnique({
    where: { id: jedinicaId },
    select: { id: true, naziv: true },
  });

  if (!jedinica) {
    return new Response("Jedinica nije pronađena.", { status: 404 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [rezervacije, blokade] = await Promise.all([
    prisma.rezervacija.findMany({
      where: {
        jedinicaId,
        obrisanoAt: null,
        status: { notIn: ["OTKAZANO", "UPIT"] },
        datumDo: { gte: today },
      },
      select: { id: true, datumOd: true, datumDo: true },
    }),
    prisma.blokadaJedinice.findMany({
      where: {
        jedinicaId,
        aktivna: true,
        datumDo: { gte: today },
      },
      select: { id: true, datumOd: true, datumDo: true },
    }),
  ]);

  const stamp = fmtStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Malinska Stay//Apartmani iCal//HR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Malinska Stay - ${jedinica.naziv}`,
    "X-WR-TIMEZONE:Europe/Zagreb",
  ];

  for (const r of rezervacije) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:rezervacija-${r.id}@malinska-stay.hr`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fmtDate(r.datumOd)}`,
      `DTEND;VALUE=DATE:${fmtDate(r.datumDo)}`,
      "SUMMARY:Rezervirano - Malinska Stay",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  for (const b of blokade) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:blokada-${b.id}@malinska-stay.hr`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fmtDate(b.datumOd)}`,
      `DTEND;VALUE=DATE:${fmtDate(b.datumDo)}`,
      "SUMMARY:Blokirano - Malinska Stay",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Content-Disposition": "inline; filename=jedinica.ics",
    },
  });
}
