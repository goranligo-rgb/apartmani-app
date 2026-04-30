import { prisma } from "@/lib/prisma";

export async function GET() {
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
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
  });

  return Response.json(slike);
}