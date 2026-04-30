import { prisma } from "@/lib/prisma";

export async function GET() {
  const slike = await prisma.slikaObjekta.findMany({
    where: {
      aktivna: true,
      prikaziNaDashboardu: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
  });

  return Response.json(slike);
}