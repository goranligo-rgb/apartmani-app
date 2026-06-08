import { prisma } from "@/lib/prisma";
import AdminSlikeGalerijaClient from "./slike-galerija-client";

export const dynamic = "force-dynamic";

export default async function AdminSlikePage() {
  const objekti = await prisma.objekt.findMany({
    orderBy: { naziv: "asc" },
    select: { id: true, naziv: true },
  });

  const jedinice = await prisma.jedinica.findMany({
    orderBy: [
      { objekt: { naziv: "asc" } },
      { sortOrder: "asc" },
      { naziv: "asc" },
    ],
    select: { id: true, naziv: true, objektId: true },
  });

  const slike = await prisma.slikaObjekta.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      url: true,
      aktivna: true,
      prikaziNaDashboardu: true,
      sortOrder: true,
      objektId: true,
      jedinicaId: true,
    },
  });

  return (
    <AdminSlikeGalerijaClient
      objekti={objekti}
      jedinice={jedinice}
      slike={slike}
    />
  );
}
