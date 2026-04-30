import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.objekt.findMany({
    orderBy: { naziv: "asc" },
  });

  return Response.json(data);
}