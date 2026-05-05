"use client";

import { useMemo, useState } from "react";

type Objekt = {
  id: string;
  naziv: string;
};

type Jedinica = {
  id: string;
  naziv: string;
  objekt: {
    id: string;
    naziv: string;
  };
};

type Slika = {
  id: string;
  url: string;
  aktivna: boolean;
  prikaziNaPocetnoj: boolean;
  prikaziNaDashboardu: boolean;
  sortOrder: number;
  objekt?: Objekt | null;
  jedinica?: Jedinica | null;
};

type GrupaSlika = {
  url: string;
  slike: Slika[];
  aktivna: boolean;
};

function kraticaObjekta(naziv: string) {
  if (naziv === "House Art") return "HA";
  if (naziv === "Luxury Apartments Marty") return "AM";
  if (naziv === "Apartments Eva") return "AE";
  return naziv;
}

function kraticaJedinice(j: Jedinica) {
  if (j.objekt.naziv === "House Art") return "HA";
  if (j.objekt.naziv === "Luxury Apartments Marty") {
    return `AM${j.naziv.replace("Marty ", "")}`;
  }
  if (j.objekt.naziv === "Apartments Eva") {
    return `AE${j.naziv.replace("Eva ", "")}`;
  }
  return j.naziv;
}

export default function AdminSlikeClient({
  objekti,
  jedinice,
  slike: pocetneSlike,
}: {
  objekti: Objekt[];
  jedinice: Jedinica[];
  slike: Slika[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [slike, setSlike] = useState<Slika[]>(pocetneSlike);
  const [loading, setLoading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState("");

  const grupe = useMemo<GrupaSlika[]>(() => {
    const map = new Map<string, Slika[]>();

    for (const slika of slike) {
      if (!map.has(slika.url)) map.set(slika.url, []);
      map.get(slika.url)!.push(slika);
    }

    return Array.from(map.entries()).map(([url, slike]) => ({
      url,
      slike,
      aktivna: slike.some((s) => s.aktivna),
    }));
  }, [slike]);

  async function ucitajSlike() {
    const res = await fetch("/api/slike", { cache: "no-store" });
    if (!res.ok) return;

    const data = await res.json();
    setSlike(data);
  }

  async function uploadSlike() {
    if (files.length === 0) {
      alert("Odaberi jednu ili više slika");
      return;
    }

    setLoading(true);
    setUploadInfo(`Spremam ${files.length} slika...`);

    try {
      const formData = new FormData();

      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/slike/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        alert("Greška kod uploada slika");
        return;
      }

      setFiles([]);
      setFileInputKey((v) => v + 1);
      await ucitajSlike();

      alert(`Spremljeno je ${files.length} slika`);
    } finally {
      setLoading(false);
      setUploadInfo("");
    }
  }

  async function dodijeliSliku(payload: {
    url: string;
    checked: boolean;
    tip: "AKTIVNA" | "OBJEKT" | "JEDINICA" | "DASHBOARD_OBJEKTA";
    objektId?: string;
    jedinicaId?: string;
  }) {
    const res = await fetch("/api/slike/dodjela", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      alert("Greška kod spremanja dodjele slike");
      return;
    }

    await ucitajSlike();
  }

  async function obrisiGrupu(url: string) {
    if (!confirm("Obrisati ovu sliku i sve njezine dodjele?")) return;

    const zapisi = slike.filter((s) => s.url === url);

    for (const zapis of zapisi) {
      await fetch(`/api/slike/${zapis.id}`, {
        method: "DELETE",
      });
    }

    await ucitajSlike();
  }

  function imaObjekt(grupa: GrupaSlika, objektId: string) {
    return grupa.slike.some(
      (s) =>
        s.objekt?.id === objektId &&
        !s.jedinica &&
        !s.prikaziNaDashboardu
    );
  }

  function imaJedinicu(grupa: GrupaSlika, jedinicaId: string) {
    return grupa.slike.some((s) => s.jedinica?.id === jedinicaId);
  }

  function imaDashboardObjekta(grupa: GrupaSlika, objektId: string) {
    return grupa.slike.some(
      (s) =>
        s.objekt?.id === objektId &&
        !s.jedinica &&
        s.prikaziNaDashboardu
    );
  }

  return (
    <main
      className="min-h-screen px-4 py-8 md:px-8"
      style={{
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        background:
          "linear-gradient(135deg, #f4efe6 0%, #efe1cc 45%, #f8f3ea 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[#9b7a4c]">
              Admin
            </p>

            <h1 className="text-4xl font-black text-[#2e2923]">
              Slike objekata i jedinica
            </h1>

            <p className="mt-3 text-[#6f665a]">
              Uploadaj više slika odjednom, a zatim kućicama označi gdje se
              svaka slika prikazuje.
            </p>
          </div>

          <a
            href="/admin"
            className="cursor-pointer border border-[#d8c7aa] bg-white px-5 py-3 text-sm font-black text-[#2e2923] hover:bg-[#fbf8f2]"
          >
            ← Admin dashboard
          </a>
        </div>

        <section className="mb-8 border border-[#e4d6c0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-2xl font-black text-[#2e2923]">
            Upload slika
          </h2>

          <div className="mt-5">
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="w-full cursor-pointer border border-[#d8c7aa] bg-white p-3 text-[#2e2923] file:mr-4 file:cursor-pointer file:border-0 file:bg-[#0b252b] file:px-4 file:py-2 file:font-black file:text-white"
            />

            {files.length > 0 && (
              <div className="mt-2 text-sm font-bold text-[#6f665a]">
                Odabrano: {files.length} slika
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={uploadSlike}
            disabled={loading}
            className="mt-5 cursor-pointer bg-[#0b252b] px-7 py-3 font-black text-white hover:bg-[#163941] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? uploadInfo || "Spremam..." : "Upload slika"}
          </button>
        </section>

        <section className="border border-[#e4d6c0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-2xl font-black text-[#2e2923]">
            Dodjela slika
          </h2>

          <div className="mt-3 text-sm font-bold text-[#6f665a]">
            HA = House Art, AM = Apartments Marty, AE = Apartments Eva, DBO =
            dashboard objekta.
          </div>

          {grupe.length === 0 ? (
            <div className="mt-6 border border-dashed border-[#d8c7aa] bg-[#fbf8f2] p-8 text-center text-[#6f665a]">
              Još nema uploadanih slika.
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              {grupe.map((grupa) => (
                <div
                  key={grupa.url}
                  className="grid gap-4 border border-[#e4d6c0] bg-[#fbf8f2] p-4 lg:grid-cols-[260px_1fr]"
                >
                  <div>
                    <div className="h-44 overflow-hidden bg-[#ddd]">
                      <img
                        src={grupa.url}
                        alt="Slika"
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => obrisiGrupu(grupa.url)}
                      className="mt-3 w-full cursor-pointer border border-red-200 bg-white px-4 py-2 font-black text-red-700 hover:bg-red-50"
                    >
                      Obriši sliku
                    </button>
                  </div>

                  <div>
                    <div className="mb-4 flex flex-wrap gap-3">
                      <label className="flex cursor-pointer items-center gap-2 bg-white px-3 py-2 font-black text-[#2e2923]">
                        <input
                          type="checkbox"
                          checked={grupa.aktivna}
                          onChange={(e) =>
                            dodijeliSliku({
                              url: grupa.url,
                              checked: e.target.checked,
                              tip: "AKTIVNA",
                            })
                          }
                        />
                        Aktivna
                      </label>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="border border-[#e4d6c0] bg-white p-4">
                        <div className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                          Objekti
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {objekti.map((o) => (
                            <label
                              key={o.id}
                              className="flex cursor-pointer items-center gap-2 border border-[#d8c7aa] bg-[#fbf8f2] px-3 py-2 font-black text-[#2e2923]"
                            >
                              <input
                                type="checkbox"
                                checked={imaObjekt(grupa, o.id)}
                                onChange={(e) =>
                                  dodijeliSliku({
                                    url: grupa.url,
                                    checked: e.target.checked,
                                    tip: "OBJEKT",
                                    objektId: o.id,
                                  })
                                }
                              />
                              {kraticaObjekta(o.naziv)}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="border border-[#e4d6c0] bg-white p-4">
                        <div className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                          Jedinice
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {jedinice.map((j) => (
                            <label
                              key={j.id}
                              className="flex cursor-pointer items-center gap-2 border border-[#d8c7aa] bg-[#fbf8f2] px-3 py-2 font-black text-[#2e2923]"
                            >
                              <input
                                type="checkbox"
                                checked={imaJedinicu(grupa, j.id)}
                                onChange={(e) =>
                                  dodijeliSliku({
                                    url: grupa.url,
                                    checked: e.target.checked,
                                    tip: "JEDINICA",
                                    jedinicaId: j.id,
                                  })
                                }
                              />
                              {kraticaJedinice(j)}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="border border-[#e4d6c0] bg-white p-4">
                        <div className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
                          Dashboard objekta
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {objekti.map((o) => (
                            <label
                              key={o.id}
                              className="flex cursor-pointer items-center gap-2 border border-[#d8c7aa] bg-[#fbf8f2] px-3 py-2 font-black text-[#2e2923]"
                            >
                              <input
                                type="checkbox"
                                checked={imaDashboardObjekta(grupa, o.id)}
                                onChange={(e) =>
                                  dodijeliSliku({
                                    url: grupa.url,
                                    checked: e.target.checked,
                                    tip: "DASHBOARD_OBJEKTA",
                                    objektId: o.id,
                                  })
                                }
                              />
                              DBO-{kraticaObjekta(o.naziv)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs font-bold text-[#6f665a]">
                      Zapisa u bazi za ovu sliku: {grupa.slike.length}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}