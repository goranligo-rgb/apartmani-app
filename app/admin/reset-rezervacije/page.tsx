import Link from "next/link";
import { obrisiTestRezervacije } from "./actions";

export default function ResetRezervacijePage() {
  return (
    <main className="min-h-screen bg-red-50 p-8">
      <div className="mx-auto max-w-xl border border-red-300 bg-white p-6">
        <Link href="/admin">← Povratak</Link>

        <h1 className="mt-4 text-2xl font-black text-red-700">
          ⚠ Reset test rezervacija
        </h1>

        <form action={obrisiTestRezervacije} className="mt-6 space-y-3">
          <input
            name="potvrda"
            placeholder="BRISI TEST"
            className="w-full border px-3 py-2"
          />

          <button className="w-full bg-red-700 text-white font-black py-3">
            Obriši
          </button>
        </form>
      </div>
    </main>
  );
}