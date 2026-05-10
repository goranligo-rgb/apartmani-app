import crypto from "crypto";

const TTLOCK_BASE_URL = "https://api.sciener.com";

function md5(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function getEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

async function postForm(
  path: string,
  data: Record<string, string | number>
) {
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
    throw new Error(json.errmsg || "TTLock API greška");
  }

  return json;
}

export async function getTtlockAccessToken() {
  const json = await postForm("/oauth2/token", {
    client_id: getEnv("TTLOCK_CLIENT_ID"),
    client_secret: getEnv("TTLOCK_CLIENT_SECRET"),
    username: getEnv("TTLOCK_USERNAME"),
    password: md5(getEnv("TTLOCK_PASSWORD")),
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

  return await postForm("/v3/keyboardPwd/add", {
    clientId: getEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: Number(params.lockId),
    keyboardPwd: params.sifra,
    keyboardPwdName: params.naziv || "Malinska Stay gost",
    startDate: params.vrijediOd.getTime(),
    endDate: params.vrijediDo.getTime(),
    addType: 2,
    date: Date.now(),
  });
}