import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

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

    const spremljene = [];

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

      const slika = await prisma.slikaObjekta.create({
        data: {
          url: publicUrlData.publicUrl,
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