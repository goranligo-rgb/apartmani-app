import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminSessionOk } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { dohvatiIspis, procitajParametre } from "@/lib/racuniIspis";

// Spaja već izdane PDF-ove računa u jedan, bez ponovnog generiranja, da ispis
// bude točno ono što je izdano. Rezultat ide u privatni bucket i vraća se
// redirectom na potpisani link jer Vercel ograničava veličinu odgovora funkcije
// na oko 4,5 MB.

const BUCKET = "racuni-ispis";
const MAPA = "ispis";
const TRAJANJE_LINKA_SEKUNDI = 600;
const STAROST_ZA_BRISANJE_MS = 24 * 60 * 60 * 1000;

function poruka(tekst: string, status: number) {
  return new NextResponse(tekst, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function sigurnoImeDatoteke(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "objekt";
}

export async function POST(req: Request) {
  // Proxy štiti /admin/*, ali ova ruta piše u bucket pa ima i vlastitu provjeru.
  if (!(await adminSessionOk())) {
    return poruka("Nisi prijavljen.", 401);
  }

  const formData = await req.formData();

  const procitano = procitajParametre({
    objekt: formData.get("objekt")?.toString(),
    godina: formData.get("godina")?.toString(),
    od: formData.get("od")?.toString(),
    do: formData.get("do")?.toString(),
  });

  if (!procitano.ok) {
    return poruka(procitano.greske.join("\n"), 400);
  }

  const { parametri } = procitano;

  const objekt = await prisma.objekt.findUnique({
    where: { id: parametri.objektId },
    select: { naziv: true, prefixRacuna: true },
  });

  if (!objekt) {
    return poruka("Odabrani objekt nije pronađen.", 404);
  }

  const { zaSpajanje } = await dohvatiIspis(parametri);

  if (zaSpajanje.length === 0) {
    return poruka("U odabranom rasponu nema računa s PDF datotekom.", 400);
  }

  const datoteke = await Promise.all(
    zaSpajanje.map(async (racun) => {
      try {
        const odgovor = await fetch(String(racun.pdfUrl), { cache: "no-store" });
        if (!odgovor.ok) throw new Error(`HTTP ${odgovor.status}`);

        return {
          brojRacuna: racun.brojRacuna,
          pdf: await PDFDocument.load(await odgovor.arrayBuffer()),
        };
      } catch (err) {
        console.error(`Skupni ispis: PDF ${racun.brojRacuna} nije učitan:`, err);
        return { brojRacuna: racun.brojRacuna, pdf: null };
      }
    })
  );

  // Račun koji ima PDF ne smije tiho nestati iz ispisa, pa nema djelomičnog PDF-a.
  const neuspjeli = datoteke.filter((d) => !d.pdf).map((d) => d.brojRacuna);

  if (neuspjeli.length > 0) {
    return poruka(
      `PDF nije napravljen jer se ovi računi nisu mogli učitati: ${neuspjeli.join(", ")}.`,
      502
    );
  }

  const spojeni = await PDFDocument.create();

  for (const { pdf } of datoteke) {
    if (!pdf) continue;

    const stranice = await spojeni.copyPages(pdf, pdf.getPageIndices());
    stranice.forEach((stranica) => spojeni.addPage(stranica));
  }

  const bajtovi = await spojeni.save();

  const { godina, odBroja, doBroja } = parametri;
  const ime = sigurnoImeDatoteke(objekt.prefixRacuna || objekt.naziv);
  const putanja = `${MAPA}/${ime}-${godina}-${odBroja}-${doBroja}-${Date.now()}-${crypto.randomUUID()}.pdf`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await obrisiStareIspise(supabase);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(putanja, Buffer.from(bajtovi), {
      contentType: "application/pdf",
    });

  if (error) {
    console.error("Skupni ispis: spremanje PDF-a nije uspjelo:", error);
    return poruka("Spojeni PDF nije spremljen.", 500);
  }

  const { data, error: greskaLinka } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(putanja, TRAJANJE_LINKA_SEKUNDI);

  if (greskaLinka || !data) {
    console.error("Skupni ispis: link na PDF nije napravljen:", greskaLinka);
    return poruka("Link na spojeni PDF nije napravljen.", 500);
  }

  return NextResponse.redirect(data.signedUrl, 303);
}

// Neuspjelo čišćenje ne smije spriječiti ispis.
async function obrisiStareIspise(supabase: SupabaseClient) {
  try {
    const granica = Date.now() - STAROST_ZA_BRISANJE_MS;

    const { data, error } = await supabase.storage.from(BUCKET).list(MAPA, {
      limit: 1000,
      sortBy: { column: "created_at", order: "asc" },
    });

    if (error) throw error;

    // Podmape nemaju created_at.
    const stare = (data ?? [])
      .filter(
        (f) => f.created_at && new Date(f.created_at).getTime() < granica
      )
      .map((f) => `${MAPA}/${f.name}`);

    if (stare.length === 0) return;

    const { error: greskaBrisanja } = await supabase.storage
      .from(BUCKET)
      .remove(stare);

    if (greskaBrisanja) throw greskaBrisanja;
  } catch (err) {
    console.error("Skupni ispis: čišćenje starih PDF-ova nije uspjelo:", err);
  }
}
