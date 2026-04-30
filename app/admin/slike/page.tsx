import { prisma } from "@/lib/prisma";
import AdminSlikeClient from "./slike-client";

export const dynamic = "force-dynamic";

export default async function AdminSlikePage() {
  const objekti = await prisma.objekt.findMany({
    orderBy: {
      naziv: "asc",
    },
  });

  const jedinice = await prisma.jedinica.findMany({
    include: {
      objekt: true,
    },
    orderBy: [
      {
        objekt: {
          naziv: "asc",
        },
      },
      {
        sortOrder: "asc",
      },
      {
        naziv: "asc",
      },
    ],
  });

  const slike = await prisma.slikaObjekta.findMany({
    include: {
      objekt: true,
      jedinica: {
        include: {
          objekt: true,
        },
      },
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  return (
    <AdminSlikeClient
      objekti={objekti.map((o) => ({
        id: o.id,
        naziv: o.naziv,
      }))}
      jedinice={jedinice.map((j) => ({
        id: j.id,
        naziv: j.naziv,
        objekt: {
          id: j.objekt.id,
          naziv: j.objekt.naziv,
        },
      }))}
      slike={slike.map((s) => ({
        id: s.id,
        url: s.url,
        aktivna: s.aktivna,
        prikaziNaPocetnoj: s.prikaziNaPocetnoj,
        prikaziNaDashboardu: s.prikaziNaDashboardu,
        sortOrder: s.sortOrder,
        objekt: s.objekt
          ? {
              id: s.objekt.id,
              naziv: s.objekt.naziv,
            }
          : null,
        jedinica: s.jedinica
          ? {
              id: s.jedinica.id,
              naziv: s.jedinica.naziv,
              objekt: {
                id: s.jedinica.objekt.id,
                naziv: s.jedinica.objekt.naziv,
              },
            }
          : null,
      }))}
    />
  );
}