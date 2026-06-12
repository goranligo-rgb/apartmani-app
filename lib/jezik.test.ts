// Unit-test resolvera rezerviraniJezik — BEZ mreže, BEZ baze.
// Pokretanje:  npx tsx lib/jezik.test.ts

import assert from "node:assert";
import { rezerviraniJezik } from "./jezik";

let prosao = 0;
function test(naziv: string, fn: () => void) {
  fn();
  prosao++;
  console.log(`  ✓ ${naziv}`);
}

console.log("rezerviraniJezik:");

test("at + 'hr' (zaglavljeni default) → de", () => {
  assert.equal(rezerviraniJezik({ jezik: "hr", drzava: "at" }), "de");
});

test("hr + 'hr' (pravi hrvatski gost) → hr", () => {
  assert.equal(rezerviraniJezik({ jezik: "hr", drzava: "hr" }), "hr");
});

test("null jezik + at → de (izvedi iz države)", () => {
  assert.equal(rezerviraniJezik({ jezik: null, drzava: "at" }), "de");
});

test("eksplicitni 'en' + at → en (NE gazi izbor)", () => {
  assert.equal(rezerviraniJezik({ jezik: "en", drzava: "at" }), "en");
});

test("null jezik + null drzava → en (terminalni fallback, D1)", () => {
  assert.equal(rezerviraniJezik({ jezik: null, drzava: null }), "en");
});

// Dodatni rubni slučajevi
test("prazna zemlja + 'hr' → hr (ne diramo; nepoznata zemlja)", () => {
  assert.equal(rezerviraniJezik({ jezik: "hr", drzava: "" }), "hr");
});

test("si + 'hr' → hr (regionalni bucket, ne diramo)", () => {
  assert.equal(rezerviraniJezik({ jezik: "hr", drzava: "si" }), "hr");
});

test("null gost → en", () => {
  assert.equal(rezerviraniJezik(null), "en");
});

console.log(`\n${prosao} testova prošlo ✅`);
