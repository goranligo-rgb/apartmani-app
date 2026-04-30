"use server";

import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendCiscenjeEmail(formData: FormData) {
  try {
    const narudzbaId = String(formData.get("narudzbaId"));

    if (!narudzbaId) {
      throw new Error("Nema ID narudžbe");
    }

    const narudzba = await prisma.ciscenjeNarudzba.findUnique({
      where: { id: narudzbaId },
      include: {
        agencija: true,
        stavke: {
          include: {
            jedinica: {
              include: { objekt: true },
            },
          },
        },
      },
    });

    if (!narudzba) {
      throw new Error("Narudžba ne postoji");
    }

    // CC mailovi (razdvojeni zarezom u bazi)
    const ccList = narudzba.agencija.ccEmails
      ? narudzba.agencija.ccEmails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    // HTML mail
    const html = `
      <h2>Raspored čišćenja</h2>
      <p>
        Period: <b>${narudzba.datumOd.toLocaleDateString()} - ${narudzba.datumDo.toLocaleDateString()}</b>
      </p>

      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
        <tr style="background:#f2f2f2;">
          <th>Datum</th>
          <th>Objekt</th>
          <th>Jedinica</th>
          <th>Tip</th>
        </tr>

        ${narudzba.stavke
          .map(
            (s) => `
          <tr>
            <td>${new Date(s.datum).toLocaleDateString()}</td>
            <td>${s.nazivObjekta || ""}</td>
            <td>${s.nazivJedinice}</td>
            <td>${s.tip}</td>
          </tr>
        `
          )
          .join("")}
      </table>
    `;

    // slanje maila
    await resend.emails.send({
      from: "Malinska Stay <rezervacije@malinska-stay.hr>",
      to: narudzba.emailPrimatelja,
      cc: ccList,
      subject: narudzba.subject || "Raspored čišćenja",
      html,
      reply_to: "goran@malinska-stay.hr",
    });

    // update statusa
    await prisma.ciscenjeNarudzba.update({
      where: { id: narudzbaId },
      data: {
        poslanoEmail: true,
        poslanoAt: new Date(),
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("GREŠKA MAIL:", error);
    return { success: false, error: error.message };
  }
}