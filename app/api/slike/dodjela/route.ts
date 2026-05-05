import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const url = String(body.url || "");
    const checked = Boolean(body.checked);
    const tip = String(body.tip || "");
    const objektId = body.objektId ? String(body.objektId) : null;
    const jedinicaId = body.jedinicaId ? String(body.jedinicaId) : null;

    if (!url || !tip) {
      return NextResponse.json({ error: "Nedostaju podaci" }, { status: 400 });
    }

    if (tip === "AKTIVNA") {
      await prisma.slikaObjekta.updateMany({
        where: { url },
        data: { aktivna: checked },
      });

      return NextResponse.json({ ok: true });
    }

    if (tip === "OBJEKT") {
      if (!objektId) {
        return NextResponse.json({ error: "Nema objektId" }, { status: 400 });
      }

      if (checked) {
        const postoji = await prisma.slikaObjekta.findFirst({
          where: {
            url,
            objektId,
            jedinicaId: null,
            prikaziNaDashboardu: false,
          },
        });

        if (!postoji) {
          await prisma.slikaObjekta.create({
            data: {
              url,
              objektId,
              jedinicaId: null,
              aktivna: true,
              prikaziNaPocetnoj: false,
              prikaziNaDashboardu: false,
            },
          });
        }
      } else {
        await prisma.slikaObjekta.deleteMany({
          where: {
            url,
            objektId,
            jedinicaId: null,
            prikaziNaDashboardu: false,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (tip === "JEDINICA") {
      if (!jedinicaId) {
        return NextResponse.json({ error: "Nema jedinicaId" }, { status: 400 });
      }

      const jedinica = await prisma.jedinica.findUnique({
        where: { id: jedinicaId },
        select: { objektId: true },
      });

      if (!jedinica) {
        return NextResponse.json({ error: "Jedinica ne postoji" }, { status: 404 });
      }

      if (checked) {
        const postoji = await prisma.slikaObjekta.findFirst({
          where: {
            url,
            jedinicaId,
          },
        });

        if (!postoji) {
          await prisma.slikaObjekta.create({
            data: {
              url,
              objektId: jedinica.objektId,
              jedinicaId,
              aktivna: true,
              prikaziNaPocetnoj: false,
              prikaziNaDashboardu: false,
            },
          });
        }
      } else {
        await prisma.slikaObjekta.deleteMany({
          where: {
            url,
            jedinicaId,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (tip === "DASHBOARD_OBJEKTA") {
      if (!objektId) {
        return NextResponse.json({ error: "Nema objektId" }, { status: 400 });
      }

      if (checked) {
        const postoji = await prisma.slikaObjekta.findFirst({
          where: {
            url,
            objektId,
            jedinicaId: null,
            prikaziNaDashboardu: true,
          },
        });

        if (!postoji) {
          await prisma.slikaObjekta.create({
            data: {
              url,
              objektId,
              jedinicaId: null,
              aktivna: true,
              prikaziNaPocetnoj: false,
              prikaziNaDashboardu: true,
            },
          });
        }
      } else {
        await prisma.slikaObjekta.deleteMany({
          where: {
            url,
            objektId,
            jedinicaId: null,
            prikaziNaDashboardu: true,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nepoznat tip" }, { status: 400 });
  } catch (err) {
    console.error("DODJELA SLIKE ERROR:", err);
    return NextResponse.json({ error: "Greška dodjele slike" }, { status: 500 });
  }
}