import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const placanjeId = url.searchParams.get("placanjeId");

  if (!placanjeId) {
    redirect("/");
  }

  const baseUrl = url.origin;

  const res = await fetch(`${baseUrl}/api/placanja/potvrdi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ placanjeId }),
  });

  if (!res.ok) {
    redirect(`/placanje/${placanjeId}?error=1`);
  }

  redirect(`/placanje/${placanjeId}?success=1`);
}