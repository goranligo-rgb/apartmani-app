// Unit-test čiste funkcije odluke — BEZ mreže, BEZ baze.
// Pokretanje:  npx tsx lib/ttlock-odluka.test.ts
// (Projekt nema test-runner; tsx + node:assert je dovoljno za čistu funkciju.)

import assert from "node:assert";
import { odlukaTtlockAkcije } from "./ttlock-odluka";

let prosao = 0;
function test(naziv: string, fn: () => void) {
  fn();
  prosao++;
  console.log(`  ✓ ${naziv}`);
}

console.log("odlukaTtlockAkcije:");

test("nema keyboardPwdId → ADD", () => {
  const o = odlukaTtlockAkcije({ keyboardPwdId: null, sifra: "6388" });
  assert.equal(o.akcija, "ADD");
  assert.equal(o.saljiNoviBroj, false);
});

test("prazan keyboardPwdId ('') → ADD", () => {
  const o = odlukaTtlockAkcije({ keyboardPwdId: "", sifra: "6388" });
  assert.equal(o.akcija, "ADD");
});

test("ima pwdId, isti broj na bravi → CHANGE bez novog broja", () => {
  const o = odlukaTtlockAkcije({
    keyboardPwdId: "123",
    sifra: "6388",
    sifraNaBravi: "6388",
  });
  assert.equal(o.akcija, "CHANGE");
  assert.equal(o.saljiNoviBroj, false);
  assert.equal(o.razlog, "isti-broj-novo-vrijeme");
});

test("ima pwdId, drugi broj na bravi → CHANGE s novim brojem", () => {
  const o = odlukaTtlockAkcije({
    keyboardPwdId: "123",
    sifra: "6388",
    sifraNaBravi: "1111",
  });
  assert.equal(o.akcija, "CHANGE");
  assert.equal(o.saljiNoviBroj, true);
  assert.equal(o.razlog, "drugi-broj-ili-nepoznat");
});

test("ima pwdId, stari broj NEPOZNAT (undefined) → CHANGE s novim brojem (siguran default)", () => {
  const o = odlukaTtlockAkcije({ keyboardPwdId: "123", sifra: "6388" });
  assert.equal(o.akcija, "CHANGE");
  assert.equal(o.saljiNoviBroj, true);
});

console.log(`\n${prosao} testova prošlo ✅`);
