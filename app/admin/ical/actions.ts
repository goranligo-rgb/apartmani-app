"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function spremiVanjskiKalendar(formData: FormData) {
  const jedinicaId = String(formData.get("jedinicaId") || "");
  const naziv = String(formData.get("naziv") || "Booking.com").trim();
  const icalUrl = String(formData.get("icalUrl") || "").trim();

  if (!jedinicaId || !icalUrl) {
    redirect("/admin/ical?error=1");
  }

  // Provjeri postoji li već Booking link za ovu jedinicu
  const postojeci = await prisma.vanjskiKalendar.findFirst({
    where: {
      jedinicaId,
      izvor: "BOOKING",
    },
  });

  // Ako već postoji, ne dozvoli duplikat — admin mora prvo obrisati stari
  if (postojeci) {
    redirect("/admin/ical?error=duplicate");
  }

  await prisma.vanjskiKalendar.create({
    data: {
      jedinicaId,
      naziv: naziv || "Booking.com",
      izvor: "BOOKING",
      icalUrl,
      aktivan: true,
    },
  });

  revalidatePath("/admin/ical");
  redirect("/admin/ical?saved=1");
}

export async function obrisiVanjskiKalendar(formData: FormData) {
  const kalendarId = String(formData.get("kalendarId") || "");

  if (!kalendarId) {
    redirect("/admin/ical?error=1");
  }

  await prisma.vanjskiKalendar.delete({
    where: { id: kalendarId },
  });

  revalidatePath("/admin/ical");
  redirect("/admin/ical?deleted=1");
}

export async function syncSveKalendare(formData: FormData) {
  const kalendarId = String(formData.get("kalendarId") || "");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/ical/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kalendarId: kalendarId || undefined,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("SYNC ERROR:", await res.text());
      redirect("/admin/ical?error=1");
    }

    revalidatePath("/admin/ical");
    redirect("/admin/ical?synced=1");
  } catch (err) {
    console.error("SYNC EXCEPTION:", err);
    redirect("/admin/ical?error=1");
  }
}
