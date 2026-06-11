import crypto from "crypto";

const TTLOCK_BASE_URL = "https://api.sciener.com";

function md5(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Nedostaje ENV: ${name}`);
  return value;
}

async function postForm(path: string, data: Record<string, string | number>) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) {
    body.set(key, String(value));
  }

  const res = await fetch(`${TTLOCK_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok || json.errcode) {
    // PRIVREMENI DIJAGNOSTIČKI LOG (grana debug/ttlock-login) — logira CIJELI
    // TTLock odgovor (errcode/errmsg) PRIJE throw-a; inače se greška baci i
    // poziv nikad ne vidi json. Ne otkriva lozinku (TTLock je ne vraća natrag).
    // Ukloniti nakon dijagnoze.
    console.log("[ttlock-resp]", path, JSON.stringify(json));
    throw new Error(json.errmsg || JSON.stringify(json));
  }

  return json;
}

export async function getTtlockAccessToken() {
  // PRIVREMENI DIJAGNOSTIČKI LOG (grana debug/ttlock-login) — NIKAD ne logira
  // samu lozinku, samo duljine i ima li višak razmaka. Ukloniti nakon dijagnoze.
  console.log("[ttlock] user len:", (process.env.TTLOCK_USERNAME||"").length,
    "pass len:", (process.env.TTLOCK_PASSWORD||"").length,
    "user trimmed?", process.env.TTLOCK_USERNAME !== (process.env.TTLOCK_USERNAME||"").trim(),
    "pass trimmed?", process.env.TTLOCK_PASSWORD !== (process.env.TTLOCK_PASSWORD||"").trim(),
    "client_id set?", !!process.env.TTLOCK_CLIENT_ID,
    "client_secret set?", !!process.env.TTLOCK_CLIENT_SECRET);

  const json = await postForm("/oauth2/token", {
    client_id: env("TTLOCK_CLIENT_ID"),
    client_secret: env("TTLOCK_CLIENT_SECRET"),
    username: env("TTLOCK_USERNAME"),
    password: md5(env("TTLOCK_PASSWORD")),
  });

  return String(json.access_token);
}

export async function dodajTtlockSifru(params: {
  lockId: string | number;
  sifra: string;
  naziv?: string;
  vrijediOd: Date;
  vrijediDo: Date;
}) {
  const accessToken = await getTtlockAccessToken();

  // PRIVREMENI DIJAGNOSTIČKI LOG (grana debug/ttlock-login) — što ŠALJEMO na
  // /v3/keyboardPwd/add. BEZ šifre gosta: samo lockId, duljina šifre i datumski
  // prozor (ms). Potvrđuje šalje li se ispravan lockId. Ukloniti nakon dijagnoze.
  console.log("[ttlock-add-req]",
    "lockId:", Number(params.lockId),
    "lockId raw:", JSON.stringify(params.lockId),
    "sifra len:", String(params.sifra || "").length,
    "startDate:", params.vrijediOd.getTime(),
    "endDate:", params.vrijediDo.getTime(),
    "accessToken len:", String(accessToken || "").length);

  const odgovor = await postForm("/v3/keyboardPwd/add", {
    clientId: env("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: Number(params.lockId),
    keyboardPwd: params.sifra,
    keyboardPwdName: params.naziv || "Malinska Stay gost",
    startDate: params.vrijediOd.getTime(),
    endDate: params.vrijediDo.getTime(),
    addType: 2,
    date: Date.now(),
  });

  // PRIVREMENI DIJAGNOSTIČKI LOG — cijeli odgovor TTLock-a na dodavanje šifre.
  // (Pri grešci s errcode postForm baci ranije i ispiše [ttlock-resp]; ovaj se
  // ispiše samo na uspješan odgovor.) Ukloniti nakon dijagnoze.
  console.log("[ttlock-add]", JSON.stringify(odgovor));
  return odgovor;
}