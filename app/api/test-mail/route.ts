import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function GET() {
  try {
    const data = await resend.emails.send({
      from: "Malinska Stay <rezervacije@malinska-stay.hr>",
      to: "goran.ligo@gmail.com",
      subject: "Test iz domene 🚀",
      html: "<h1>Radi s domene 💥</h1>",
      reply_to: "goran@malinska-stay.hr",
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error });
  }
}