import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.jedinica.findMany({
    include: { objekt: true },
    orderBy: { naziv: "asc" },
  });

  return Response.json(data);
}