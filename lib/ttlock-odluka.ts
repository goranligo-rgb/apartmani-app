// ── Čista odluka: koja TTLock akcija za sinkronizaciju šifre? ──
//
// Izdvojeno u zaseban modul BEZ ikakvih importa (mreža, prisma, env) da bude
// trivijalno unit-testabilno. Orkestrator `sinkronizirajTtlockSifru`
// (lib/ttlock.ts) zove ovu funkciju i prema rezultatu radi stvarne API pozive.
//
// Pozadina (D1, Opcija X): kad za rezervaciju+bravu već postoji šifra na bravi
// (imamo `keyboardPwdId` iz baze), NE smijemo ponovo zvati keyboardPwd/add s
// istim brojem — brava vrati "The same passcode already exists." Umjesto toga
// koristimo keyboardPwd/change (zadrži isti pwdId), opcionalno s newKeyboardPwd
// za promjenu broja. DELETE+ADD je runtime fallback (vidi orkestrator) i NIJE
// dio ove čiste odluke.

export type TtlockAkcija = "ADD" | "CHANGE" | "DELETE_ADD";

export type TtlockOdluka = {
  // Čista odluka poznaje samo ADD ili CHANGE. DELETE_ADD nastaje tek u runtime-u
  // kao fallback ako CHANGE vrati grešku (npr. pwdId zastario na bravi).
  akcija: "ADD" | "CHANGE";
  // Za CHANGE: treba li poslati newKeyboardPwd (mijenjamo i sam broj)?
  saljiNoviBroj: boolean;
  // Za log / test — zašto je odabrana ova akcija.
  razlog: string;
};

/**
 * Odlučuje akciju na temelju stanja u bazi:
 *  - nema `keyboardPwdId`            → ADD (prvi push, brava još nema šifru)
 *  - ima pwdId, `sifraNaBravi`===sifra → CHANGE bez newKeyboardPwd (samo vrijeme)
 *  - ima pwdId, inače                 → CHANGE s newKeyboardPwd (promjena broja
 *                                       ILI stari broj nepoznat → siguran superset)
 *
 * `sifraNaBravi` je zadnji broj koji JE na bravi. Trenutno ga ne pohranjujemo
 * (D1: bez nove sheme), pa pozivatelj predaje undefined → uvijek saljiNoviBroj
 * = true. To je siguran default: change s newKeyboardPwd = istom broju je no-op
 * na broju, a ispravno postavi vrijeme. Branch "isti-broj" je spreman za kad
 * (ako) uvedemo polje `sifraNaBravi`.
 */
export function odlukaTtlockAkcije(input: {
  keyboardPwdId?: string | null;
  sifra: string;
  sifraNaBravi?: string | null;
}): TtlockOdluka {
  if (!input.keyboardPwdId) {
    return { akcija: "ADD", saljiNoviBroj: false, razlog: "nema-pwdId" };
  }

  const istiBroj =
    input.sifraNaBravi != null && input.sifraNaBravi === input.sifra;

  if (istiBroj) {
    return {
      akcija: "CHANGE",
      saljiNoviBroj: false,
      razlog: "isti-broj-novo-vrijeme",
    };
  }

  return {
    akcija: "CHANGE",
    saljiNoviBroj: true,
    razlog: "drugi-broj-ili-nepoznat",
  };
}
