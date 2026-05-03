import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const jedinica = await prisma.jedinica.findFirst();

  if (!jedinica) {
    return NextResponse.json({ error: "Nema jedinice u bazi" });
  }

  const kal = await prisma.vanjskiKalendar.create({
    data: {
      naziv: "Booking.com",
      izvor: "BOOKING",
      icalUrl: "https://www.calendarlabs.com/ical-calendar/ics/76/US_Holidays.ics", // TEST LINK
      jedinicaId: jedinica.id,
    },
  });

  return NextResponse.json({
    ok: true,
    kal,
  });
}