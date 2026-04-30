import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const prijedlogId = String(body.prijedlogId || "");
  const action = String(body.action || "");

  if (!prijedlogId || !action) {
    return NextResponse.json(
      { error: "Nedostaju podaci." },
      { status: 400 }
    );
  }

  const prijedlog = await prisma.prijedlogAkcije.findUnique({
    where: { id: prijedlogId },
  });

  if (!prijedlog) {
    return NextResponse.json(
      { error: "Prijedlog nije pronađen." },
      { status: 404 }
    );
  }

  if (action === "approve") {
    await prisma.akcija.create({
      data: {
        jedinicaId: prijedlog.jedinicaId,
        naziv: "Automatski prijedlog za rupu u kalendaru",
        datumOd: prijedlog.datumOd,
        datumDo: prijedlog.datumDo,
        postotakPopusta: prijedlog.predlozeniPopust,
        aktivna: true,
      },
    });

    await prisma.prijedlogAkcije.update({
      where: { id: prijedlogId },
      data: { status: "ODOBRENO" },
    });

    return NextResponse.json({ success: true });
  }

  if (action === "reject") {
    await prisma.prijedlogAkcije.update({
      where: { id: prijedlogId },
      data: { status: "ODBIJENO" },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Nepoznata akcija." },
    { status: 400 }
  );
}