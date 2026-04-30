type SendMailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendMail({ to, subject, html }: SendMailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Apartmani <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      ok: false,
      error: "Nedostaje RESEND_API_KEY u .env datoteci.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();

    return {
      ok: false,
      error: text,
    };
  }

  const data = await response.json();

  return {
    ok: true,
    id: data?.id || null,
  };
}