// Infobip SMS slanje preko REST API-ja (fetch, bez npm paketa) — isti stil
// kao lib/twilio.ts / lib/ttlock.ts. Koristi se za automatski check-in SMS.

import { normalizirajE164 } from "@/lib/twilio";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Nedostaje ENV: ${name}`);
  return value;
}

/**
 * Jesu li sve obavezne Infobip env varijable postavljene. Cron preskače slanje
 * dok env nije popunjen (sprječava dnevni spam grešaka).
 */
export function imaInfobipKonfiguraciju(): boolean {
  return Boolean(
    process.env.INFOBIP_BASE_URL &&
      process.env.INFOBIP_API_KEY &&
      process.env.INFOBIP_SMS_SENDER
  );
}

/**
 * Infobip prima broj u E.164 BEZ vodećeg "+" (npr. "385915555555").
 * Reusamo normalizirajE164 iz lib/twilio i samo skinemo vodeći "+".
 * Vraća null ako broj nije upotrebljiv.
 */
function infobipBroj(telefon?: string | null): string | null {
  const e164 = normalizirajE164(telefon);
  if (!e164) return null;
  return e164.replace(/^\+/, "");
}

/**
 * Šalje obični SMS preko Infobip-a. Baca Error na neuspjeh.
 * Vraća messageId iz odgovora (messages[0].messageId).
 */
export async function posaljiSmsInfobip(params: {
  to: string;
  text: string;
}): Promise<{ messageId: string; to: string }> {
  // Base URL iz Infobip konzole dolazi kao host (npr. "xyz.api.infobip.com");
  // dopuštamo i puni URL sa shemom za svaki slučaj.
  const baseRaw = env("INFOBIP_BASE_URL").trim().replace(/\/+$/, "");
  const baseUrl = /^https?:\/\//i.test(baseRaw) ? baseRaw : `https://${baseRaw}`;
  const apiKey = env("INFOBIP_API_KEY");
  const sender = env("INFOBIP_SMS_SENDER");

  const to = infobipBroj(params.to);
  if (!to) throw new Error(`Neispravan broj za SMS: ${params.to}`);

  const res = await fetch(`${baseUrl}/sms/3/messages`, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          sender,
          destinations: [{ to }],
          content: { text: params.text },
        },
      ],
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => ({}));
  const msg = json?.messages?.[0];
  const status = msg?.status;

  // Infobip vraća HTTP 200 i status.groupName PENDING/DELIVERED za prihvaćene;
  // REJECTED ili nedostajući messageId tretiramo kao grešku.
  if (!res.ok || !msg || !msg.messageId || status?.groupName === "REJECTED") {
    throw new Error(
      status?.description ||
        json?.requestError?.serviceException?.text ||
        `Infobip greška (HTTP ${res.status})`
    );
  }

  return { messageId: String(msg.messageId), to };
}
