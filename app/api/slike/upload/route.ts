import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import type { SlikaObjekta } from "@prisma/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = "slike";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const data = await req.formData();

    const files = data.getAll("files") as File[];
    const fallbackFile = data.get("file") as File | null;
    const allFiles = files.length > 0 ? files : fallbackFile ? [fallbackFile] : [];

    if (allFiles.length === 0) {
      return NextResponse.json({ error: "Nema slika" }, { status: 400 });
    }

    // Ciljani objekt (novi UI: upload ravno u tab objekta). Ako nije zadan,
    // ostaje stari "bare" put (objektId/jedinicaId = null, sortOrder 0).
    const objektIdRaw = data.get("objektId");
    const objektId = objektIdRaw ? String(objektIdRaw) : null;

    // Bazni sortOrder = max postojećeg za objekt-set + 1 (nove slike padaju na
    // KRAJ galerije). Svaka slika u ovom uploadu dobiva base + redni broj da
    // ne nastane tie. Isti set kao javna galerija / reorder endpoint.
    let baseSortOrder = 0;
    if (objektId) {
      const objekt = await prisma.objekt.findUnique({
        where: { id: objektId },
        select: { id: true },
      });

      if (!objekt) {
        return NextResponse.json({ error: "Objekt ne postoji" }, { status: 400 });
      }

      const agg = await prisma.slikaObjekta.aggregate({
        where: { OR: [{ objektId }, { jedinica: { objektId } }] },
        _max: { sortOrder: true },
      });

      baseSortOrder = (agg._max.sortOrder ?? -1) + 1;
    }

    const spremljene: SlikaObjekta[] = [];

    for (const file of allFiles) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${safeName}`;

      const filePath = `uploads/${fileName}`;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (error) {
        console.error("SUPABASE UPLOAD ERROR:", error);
        return NextResponse.json(
          { error: "Greška Supabase upload" },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      // Bez objekta → bare red, sortOrder 0 (kao prije). S objektom → base +
      // redni broj u ovom uploadu (kraj galerije, bez tie-a). Izračun je u
      // lokalnoj varijabli (ne unutar create-a) da se izbjegne cirkularna
      // type-inference na `spremljene`.
      const trenutniSortOrder = objektId
        ? baseSortOrder + spremljene.length
        : 0;

      const slika = await prisma.slikaObjekta.create({
        data: {
          url: publicUrlData.publicUrl,
          aktivna: true,
          prikaziNaPocetnoj: false,
          prikaziNaDashboardu: false,
          objektId,
          jedinicaId: null,
          sortOrder: trenutniSortOrder,
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