import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const data = await req.formData();

    const files = data.getAll("files") as File[];
    const fallbackFile = data.get("file") as File | null;
    const allFiles = files.length > 0 ? files : fallbackFile ? [fallbackFile] : [];

    if (allFiles.length === 0) {
      return NextResponse.json({ error: "Nema slika" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public/uploads");
    await mkdir(uploadDir, { recursive: true });

    const spremljene = [];

    for (const file of allFiles) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${safeName}`;

      await writeFile(path.join(uploadDir, fileName), buffer);

      const slika = await prisma.slikaObjekta.create({
        data: {
          url: `/uploads/${fileName}`,
          aktivna: true,
          prikaziNaPocetnoj: false,
          prikaziNaDashboardu: false,
          objektId: null,
          jedinicaId: null,
        },
      });

      spremljene.push(slika);
    }

    return NextResponse.json(spremljene);
  } catch (err) {
    console.error("UPLOAD SLIKE ERROR:", err);
    return NextResponse.json({ error: "Greška upload" }, { status: 500 });
  }
}