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

// DRY-RUN način rada za sigurno testiranje BEZ diranja fizičke brave.
// Kad je TTLOCK_DRY_RUN="true", mutirajući pozivi (add/change/delete) NE šalju
// ništa na TTLock — samo logiraju što BI poslali i vrate sintetički odgovor.
// Default (flag odsutan/false) → nula promjene ponašanja, sve ide na bravu.
function jeDryRun() {
  return process.env.TTLOCK_DRY_RUN === "true";
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

  // DRY-RUN: ne diraj bravu, vrati sintetički keyboardPwdId (pozivatelji ga
  // čitaju iz response.keyboardPwdId i spremaju u bazu).
  if (jeDryRun()) {
    const fakeId = `DRYRUN-${Number(params.lockId)}-${params.vrijediOd.getTime()}`;
    console.log("[ttlock-add][DRY_RUN] preskačem keyboardPwd/add →", fakeId);
    return { errcode: 0, keyboardPwdId: fakeId };
  }

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

// IZMJENA postojeće šifre na bravi — /v3/keyboardPwd/change (changeType:2 =
// gateway, isto kao add addType:2 → remote, bez bluetootha). Mijenja vremenski
// prozor (startDate/endDate) i opcionalno sam broj (newKeyboardPwd). keyboardPwdId
// dolazi iz baze (RezervacijaTtlockSifra.ttlockKeyboardPwdId), spremljen pri add-u.
// vrijediOd/Do su VEĆ ispravni instanti (zagrebWallClockToInstant kod pozivatelja)
// — ovdje ih samo prosljeđujemo kao Unix ms, BEZ ikakvog novog TZ izračuna.
export async function promijeniTtlockSifru(params: {
  lockId: string | number;
  keyboardPwdId: string | number;
  vrijediOd: Date;
  vrijediDo: Date;
  sifra?: string; // ako je zadan → mijenja se i broj (newKeyboardPwd)
  naziv?: string;
}) {
  const accessToken = await getTtlockAccessToken();

  // Dijagnostički log (bez šifre gosta): lockId, pwdId, prozor (ms), mijenja li broj.
  console.log("[ttlock-change-req]",
    "lockId:", Number(params.lockId),
    "keyboardPwdId:", String(params.keyboardPwdId),
    "startDate:", params.vrijediOd.getTime(),
    "endDate:", params.vrijediDo.getTime(),
    "mijenjaBroj:", Boolean(params.sifra),
    "accessToken len:", String(accessToken || "").length);

  if (jeDryRun()) {
    console.log("[ttlock-change][DRY_RUN] preskačem keyboardPwd/change");
    return { errcode: 0 };
  }

  // newKeyboardPwd se šalje SAMO kad mijenjamo broj — inače se zadržava postojeći.
  const data: Record<string, string | number> = {
    clientId: env("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: Number(params.lockId),
    keyboardPwdId: Number(params.keyboardPwdId),
    keyboardPwdName: params.naziv || "Malinska Stay gost",
    startDate: params.vrijediOd.getTime(),
    endDate: params.vrijediDo.getTime(),
    changeType: 2,
    date: Date.now(),
  };
  if (params.sifra) data.newKeyboardPwd = params.sifra;

  const odgovor = await postForm("/v3/keyboardPwd/change", data);
  console.log("[ttlock-change]", JSON.stringify(odgovor));
  return odgovor;
}

// BRISANJE šifre s brave — /v3/keyboardPwd/delete (deleteType:2 = WiFi gateway,
// remote). Koristi se kao fallback uz change (zastario pwdId) i za čišćenje
// orphan šifri kad admin obriše zapis u bazi.
export async function obrisiTtlockSifru(params: {
  lockId: string | number;
  keyboardPwdId: string | number;
}) {
  const accessToken = await getTtlockAccessToken();

  console.log("[ttlock-delete-req]",
    "lockId:", Number(params.lockId),
    "keyboardPwdId:", String(params.keyboardPwdId),
    "accessToken len:", String(accessToken || "").length);

  if (jeDryRun()) {
    console.log("[ttlock-delete][DRY_RUN] preskačem keyboardPwd/delete");
    return { errcode: 0 };
  }

  const odgovor = await postForm("/v3/keyboardPwd/delete", {
    clientId: env("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: Number(params.lockId),
    keyboardPwdId: Number(params.keyboardPwdId),
    deleteType: 2,
    date: Date.now(),
  });
  console.log("[ttlock-delete]", JSON.stringify(odgovor));
  return odgovor;
}