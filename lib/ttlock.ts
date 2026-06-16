import crypto from "crypto";
import { formatZagreb } from "@/lib/dates";
import {
  odlukaTtlockAkcije,
  type TtlockAkcija,
} from "@/lib/ttlock-odluka";

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

// ── Dohvat keyboardPwdId s brave po BROJU šifre — /v3/lock/listKeyboardPwd ──
//
// Recovery pomoć: kad u bazi NEMAMO keyboardPwdId (NULL) a broj je fizički na
// bravi (add vrati "already exists"), ovdje ga pronađemo po broju da bismo mogli
// CHANGE umjesto bezuspješnog ponovnog ADD-a. Cloud read — NE treba gateway.
// Prolazi stranice dok ne nađe `keyboardPwd === sifra` ili dok ne ostane stranica.
export async function dohvatiTtlockPwdIdPoBroju(
  lockId: string | number,
  sifra: string
): Promise<string | null> {
  // DRY-RUN: ne diraj API, vrati lažni id (orkestrator tada simulira recovery).
  if (jeDryRun()) {
    const fakeId = `DRYRUN-LIST-${Number(lockId)}-${sifra}`;
    console.log("[ttlock-list][DRY_RUN] preskačem listKeyboardPwd →", fakeId);
    return fakeId;
  }

  const accessToken = await getTtlockAccessToken();
  const PAGE_SIZE = 100;
  let pageNo = 1;

  // Gornji limit stranica = sigurnosna kočnica protiv beskonačne petlje.
  for (let i = 0; i < 50; i++) {
    const odgovor: any = await postForm("/v3/lock/listKeyboardPwd", {
      clientId: env("TTLOCK_CLIENT_ID"),
      accessToken,
      lockId: Number(lockId),
      pageNo,
      pageSize: PAGE_SIZE,
      date: Date.now(),
    });

    const lista: any[] = Array.isArray(odgovor?.list) ? odgovor.list : [];
    // Broj na bravi može doći kao number ili string → usporedba preko String().
    const nadjen = lista.find((x) => String(x?.keyboardPwd) === String(sifra));

    console.log("[ttlock-list]",
      "lockId:", Number(lockId),
      "pageNo:", pageNo,
      "uListi:", lista.length,
      "total:", odgovor?.total ?? "-",
      "nadjen?", nadjen ? "DA" : "ne");

    if (nadjen?.keyboardPwdId != null) {
      return String(nadjen.keyboardPwdId);
    }

    // Ima li još stranica? TTLock vraća `pages` (ukupno stranica). Zaustavi i kad
    // je vraćena stranica kraća od PAGE_SIZE (nema više zapisa).
    const pages = Number(odgovor?.pages ?? 0);
    if (!pages || pageNo >= pages || lista.length < PAGE_SIZE) break;
    pageNo++;
  }

  return null;
}

// Detekcija TTLock greške "broj već postoji na bravi". postForm baca Error s
// porukom = errmsg (ili JSON ako errmsg prazan), pa hvatamo po tekstu. TTLock
// poruka: "The same passcode already exists. Please use another one."
function jeGreskaVecPostoji(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return /same passcode already exists/i.test(msg);
}

// ── Orkestrator: sinkroniziraj šifru na bravu (ADD / CHANGE / fallback DELETE+ADD) ──
//
// Jedini ulaz za pozivatelje (cron whatsapp-checkin + admin [id]) umjesto golog
// dodajTtlockSifru. Riješava bug "The same passcode already exists." tako da kad
// brava VEĆ ima šifru (postoji keyboardPwdId) ne dodaje novu nego je MIJENJA.
//
// Vraća { akcija, keyboardPwdId } — pozivatelj radi DB-update (status POSLANO +
// spremi keyboardPwdId). Pri potpunom neuspjehu (i fallback add baci) → throwa,
// pozivatelj to hvata i postavlja status GRESKA (kao i dosad).
export async function sinkronizirajTtlockSifru(params: {
  lockId: string | number;
  keyboardPwdId?: string | null;
  sifra: string;
  vrijediOd: Date;
  vrijediDo: Date;
  sifraNaBravi?: string | null; // zadnji broj na bravi; zasad uvijek undefined
  naziv?: string;
}): Promise<{ akcija: TtlockAkcija; keyboardPwdId: string | null }> {
  const odluka = odlukaTtlockAkcije({
    keyboardPwdId: params.keyboardPwdId,
    sifra: params.sifra,
    sifraNaBravi: params.sifraNaBravi,
  });

  // Log akcije (bez šifre gosta) — pokazuje ide li ADD vs CHANGE i KOJE vrijeme
  // (ms + čitljivo Europe/Zagreb), ključno za provjeru u DRY_RUN-u prije brave.
  const opcije: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  console.log("[ttlock-sync]",
    "akcija:", odluka.akcija,
    "razlog:", odluka.razlog,
    "saljiNoviBroj:", odluka.saljiNoviBroj,
    "lockId:", Number(params.lockId),
    "keyboardPwdId:", String(params.keyboardPwdId ?? "-"),
    "od:", `${params.vrijediOd.getTime()} (${formatZagreb(params.vrijediOd, opcije)})`,
    "do:", `${params.vrijediDo.getTime()} (${formatZagreb(params.vrijediDo, opcije)})`);

  // Recovery na "already exists": broj je fizički na bravi ali nemamo pwdId u
  // bazi. Dohvati pwdId s brave po broju pa CHANGE (isti broj, ispravan prozor).
  // Vraća rezultat za pozivatelja ili null ako broj nije nađen na bravi.
  async function recoverPostojeciNaBravi(): Promise<{
    akcija: TtlockAkcija;
    keyboardPwdId: string | null;
  } | null> {
    const pwdId = await dohvatiTtlockPwdIdPoBroju(params.lockId, params.sifra);
    if (!pwdId) {
      console.log("[ttlock-sync] recovery: broj nije nađen na bravi → odustajem");
      return null;
    }
    console.log("[ttlock-sync] recovery: nađen pwdId", pwdId, "→ CHANGE (isti broj, ispravan prozor)");
    await promijeniTtlockSifru({
      lockId: params.lockId,
      keyboardPwdId: pwdId,
      vrijediOd: params.vrijediOd,
      vrijediDo: params.vrijediDo,
      // Broj je već na bravi (po njemu smo i našli pwdId) → ne šaljemo newKeyboardPwd.
      sifra: undefined,
      naziv: params.naziv,
    });
    return { akcija: "RECOVER_CHANGE", keyboardPwdId: String(pwdId) };
  }

  if (odluka.akcija === "ADD") {
    try {
      const resp: any = await dodajTtlockSifru({
        lockId: params.lockId,
        sifra: params.sifra,
        naziv: params.naziv,
        vrijediOd: params.vrijediOd,
        vrijediDo: params.vrijediDo,
      });
      return {
        akcija: "ADD",
        keyboardPwdId: resp?.keyboardPwdId ? String(resp.keyboardPwdId) : null,
      };
    } catch (err: any) {
      // Samo na "already exists" pokušaj recovery; ostale greške propusti dalje.
      if (!jeGreskaVecPostoji(err)) throw err;
      console.log("[ttlock-sync] ADD 'already exists' → recovery preko liste");
      const rec = await recoverPostojeciNaBravi();
      if (rec) return rec;
      throw err; // broj nije nađen na bravi → GRESKA kao i dosad
    }
  }

  // CHANGE — zadrži isti keyboardPwdId; newKeyboardPwd samo ako mijenjamo broj.
  try {
    await promijeniTtlockSifru({
      lockId: params.lockId,
      keyboardPwdId: params.keyboardPwdId!,
      vrijediOd: params.vrijediOd,
      vrijediDo: params.vrijediDo,
      sifra: odluka.saljiNoviBroj ? params.sifra : undefined,
      naziv: params.naziv,
    });
    return { akcija: "CHANGE", keyboardPwdId: String(params.keyboardPwdId) };
  } catch (err: any) {
    // Fallback: change pao (npr. pwdId zastario na bravi) → obriši staru (ako
    // još postoji) pa dodaj novu s istim brojem. Delete grešku gutamo (možda
    // šifra već ne postoji); presudan je uspjeh add-a.
    console.log("[ttlock-sync] CHANGE pao → fallback DELETE+ADD:", err?.message);
    try {
      await obrisiTtlockSifru({
        lockId: params.lockId,
        keyboardPwdId: params.keyboardPwdId!,
      });
    } catch (delErr: any) {
      console.log("[ttlock-sync] delete u fallbacku preskočen:", delErr?.message);
    }
    try {
      const resp: any = await dodajTtlockSifru({
        lockId: params.lockId,
        sifra: params.sifra,
        naziv: params.naziv,
        vrijediOd: params.vrijediOd,
        vrijediDo: params.vrijediDo,
      });
      return {
        akcija: "DELETE_ADD",
        keyboardPwdId: resp?.keyboardPwdId ? String(resp.keyboardPwdId) : null,
      };
    } catch (addErr: any) {
      // Delete vjerojatno nije maknuo broj (zastario pwdId), pa ADD opet vrati
      // "already exists" → isti recovery preko liste.
      if (!jeGreskaVecPostoji(addErr)) throw addErr;
      console.log("[ttlock-sync] fallback ADD 'already exists' → recovery preko liste");
      const rec = await recoverPostojeciNaBravi();
      if (rec) return rec;
      throw addErr;
    }
  }
}