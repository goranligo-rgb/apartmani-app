import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const data = await req.formData();

    const file = data.get("file") as File;
    const objektId = data.get("objektId") as string | null;
    const jedinicaId = data.get("jedinicaId") as string | null;
    const prikaziNaPocetnoj = data.get("pocetna") === "true";
    const prikaziNaDashboardu = data.get("dashboard") === "true";

    if (!file) {
      return NextResponse.json({ error: "Nema file-a" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileName = Date.now() + "-" + file.name;
    const filePath = path.join(process.cwd(), "public/uploads", fileName);

    await writeFile(filePath, buffer);

    const url = `/uploads/${fileName}`;

    const slika = await prisma.slikaObjekta.create({
      data: {
        url,
        objektId: objektId || null,
        jedinicaId: jedinicaId || null,
        prikaziNaPocetnoj,
        prikaziNaDashboardu,
      },
    });

    return NextResponse.json(slika);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Greška upload" }, { status: 500 });
  }
}