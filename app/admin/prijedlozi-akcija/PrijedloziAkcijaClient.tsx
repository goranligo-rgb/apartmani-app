"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Prijedlog = {
  id: string;
  datumOd: string;
  datumDo: string;
  brojNocenja: number;
  predlozeniPopust: number;
  razlog: string;
  status: "CEKA_ODOBRENJE" | "ODOBRENO" | "ODBIJENO";
  jedinicaNaziv: string;
  objektNaziv: string;
};

export default function PrijedloziAkcijaClient({
  prijedlozi,
}: {
  prijedlozi: Prijedlog[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [debugText, setDebugText] = useState("");

  async function handleAction(
    prijedlogId: string,
    action: "approve" | "reject"
  ) {
    setLoadingId(prijedlogId);

    const res = await fetch("/api/admin/prijedlozi-akcija", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prijedlogId, action }),
    });

    setLoadingId("");

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Greška kod obrade prijedloga.");
      return;
    }

    router.refresh();
  }

  async function generateSuggestions() {
    setGenerating(true);
    setDebugText("");

    const res = await fetch("/api/admin/prijedlozi-akcija/generiraj", {
      method: "POST",
    });

    setGenerating(false);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Greška kod generiranja prijedloga.");
      return;
    }

    setDebugText(JSON.stringify(data, null, 2));
    alert(`Kreirano prijedloga: ${data.created}`);
    router.refresh();
  }

  async function createTestGap() {
    const jedinicaId = prompt("Upiši ID jedinice");

    if (!jedinicaId) return;

    setCreatingTest(true);
    setDebugText("");

    const res = await fetch("/api/admin/test-gap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jedinicaId }),
    });

    setCreatingTest(false);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setDebugText(JSON.stringify(data, null, 2));
      alert(data.error || "Greška kod test rupe.");
      return;
    }

    setDebugText(JSON.stringify(data, null, 2));
    alert("Test rupa napravljena!");
    router.refresh();
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 border border-white/70 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#9b7a4c]">
                Admin
              </p>
              <h1 className="text-3xl font-bold text-[#2e2923]">
                Prijedlozi akcija
              </h1>
              <p className="mt-2 text-[#6f665a]">
                Sustav prepoznaje rupe u kalendaru i predlaže akcije. Ti odlučuješ
                hoće li ići na web.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={createTestGap}
                disabled={creatingTest}
                className="border border-[#d9cfbf] bg-white px-5 py-3 font-semibold text-[#2e2923] transition hover:bg-[#f8f3ea] disabled:opacity-60"
              >
                {creatingTest ? "Radim test rupu..." : "Ubaci test rupu"}
              </button>

              <button
                type="button"
                onClick={generateSuggestions}
                disabled={generating}
                className="border border-[#caa870] bg-[#c79a57] px-5 py-3 font-bold text-white transition hover:brightness-95 disabled:opacity-60"
              >
                {generating
                  ? "Tražim rupe..."
                  : "Pronađi rupe i predloži akcije"}
              </button>
            </div>
          </div>
        </div>

        {debugText && (
          <div className="mb-6 border border-[#d9cfbf] bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
            <div className="mb-2 text-sm font-bold text-[#2e2923]">Debug ispis</div>
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-[#5f5549]">
              {debugText}
            </pre>
          </div>
        )}

        <div className="space-y-4">
          {prijedlozi.length === 0 ? (
            <div className="border border-white/70 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.08)] text-[#6f665a]">
              Nema prijedloga akcija.
            </div>
          ) : (
            prijedlozi.map((p) => (
              <div
                key={p.id}
                className="border border-white/70 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.08)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-lg font-bold text-[#2e2923]">
                      {p.objektNaziv} — {p.jedinicaNaziv}
                    </div>

                    <div className="mt-1 text-sm text-[#6f665a]">
                      {new Date(p.datumOd).toLocaleDateString("hr-HR")} —{" "}
                      {new Date(p.datumDo).toLocaleDateString("hr-HR")}
                    </div>

                    <div className="mt-1 text-sm text-[#6f665a]">
                      Trajanje: {p.brojNocenja} noći
                    </div>

                    <div className="mt-1 text-sm font-semibold text-[#7a5b12]">
                      Predloženi popust: {p.predlozeniPopust}%
                    </div>

                    {p.razlog && (
                      <div className="mt-1 text-sm text-[#756a5f]">
                        Razlog: {p.razlog}
                      </div>
                    )}

                    <div className="mt-2 text-xs font-bold uppercase tracking-wide text-[#8b7d6b]">
                      Status: {p.status.replaceAll("_", " ")}
                    </div>
                  </div>

                  {p.status === "CEKA_ODOBRENJE" && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleAction(p.id, "approve")}
                        disabled={loadingId === p.id}
                        className="border border-[#caa870] bg-[#c79a57] px-4 py-2 font-bold text-white transition hover:brightness-95 disabled:opacity-60"
                      >
                        Pusti u akciju
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(p.id, "reject")}
                        disabled={loadingId === p.id}
                        className="border border-[#d9cfbf] bg-white px-4 py-2 font-semibold text-[#2e2923] transition hover:bg-[#f8f3ea] disabled:opacity-60"
                      >
                        Odbij
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}