import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await prisma.$executeRawUnsafe(`
    UPDATE Rezervacija
    SET status = 'POTVRDENO'
    WHERE status = 'KAPARA'
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE Rezervacija
    SET status = 'POTVRDENO'
    WHERE status = 'REZERVIRANO'
  `);

  return NextResponse.json({
    success: true,
    message: "Stari statusi KAPARA i REZERVIRANO prebačeni su u POTVRDENO.",
  });
}