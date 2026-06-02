// Twilio WhatsApp slanje preko REST API-ja (fetch, bez npm paketa) — isti stil
// kao lib/ttlock.ts. Koristi se za automatski check-in flow.

const TWILIO_BASE_URL = "https://api.twilio.com/2010-04-01";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Nedostaje ENV: ${name}`);
  return value;
}

/**
 * Jesu li sve obavezne Twilio env varijable postavljene. Cron preskače slanje
 * dok template nije odobren / env nije popunjen (sprječava dnevni spam grešaka).
 */
export function imaTwilioKonfiguraciju(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.TWILIO_WHATSAPP_TEMPLATE_SID
  );
}

/**
 * Normalizira broj u E.164 (+<country><number>). Booking brojevi su pohranjeni
 * kao pune međunarodne znamenke (npr. "385912345678"), pa dodajemo "+".
 * Vraća null ako broj nije upotrebljiv.
 */
export function normalizirajE164(telefon?: string | null): string | null {
  let raw = String(telefon || "").trim().replace(/[^\d+]/g, "");
  if (!raw) return null;

  if (raw.startsWith("00")) raw = "+" + raw.slice(2);
  else if (!raw.startsWith("+")) raw = "+" + raw;

  const digits = raw.slice(1).replace(/\D/g, "");
  if (digits.length < 8) return null;

  return "+" + digits;
}

function whatsappKanal(broj: string): string {
  return broj.startsWith("whatsapp:") ? broj : `whatsapp:${broj}`;
}

/**
 * Šalje WhatsApp utility template poruku. Baca Error na neuspjeh.
 */
export async function posaljiWhatsappTemplate(params: {
  to: string; // E.164, npr. "+385912345678"
  contentVariables: Record<string, string>;
  templateSid?: string;
}): Promise<{ sid: string; from: string; templateSid: string }> {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = whatsappKanal(env("TWILIO_WHATSAPP_FROM"));
  const templateSid = params.templateSid || env("TWILIO_WHATSAPP_TEMPLATE_SID");

  const body = new URLSearchParams();
  body.set("To", whatsappKanal(params.to));
  body.set("From", from);
  body.set("ContentSid", templateSid);
  body.set("ContentVariables", JSON.stringify(params.contentVariables));

  const res = await fetch(`${TWILIO_BASE_URL}/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => ({}));

  if (!res.ok || json.status === "failed" || json.error_code) {
    throw new Error(
      json.message ||
        json.error_message ||
        `Twilio greška (HTTP ${res.status})`
    );
  }

  return { sid: String(json.sid || ""), from, templateSid };
}
