"use client";

import { useState } from "react";

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

type TipSlike = "OBJEKT" | "JEDINICA" | "DASHBOARD";

export default function AdminSlikeClient({
  objekti,
  jedinice,
  slike: pocetneSlike,
}: {
  objekti: Objekt[];
  jedinice: Jedinica[];
  slike: Slika[];
}) {
  const [tip, setTip] = useState<TipSlike>("OBJEKT");
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [slike, setSlike] = useState<Slika[]>(pocetneSlike);

  const [objektId, setObjektId] = useState("");
  const [jedinicaId, setJedinicaId] = useState("");

  const [dashboard, setDashboard] = useState(false);
  const [pocetna, setPocetna] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState("");

  async function ucitajSlike() {
    const res = await fetch("/api/slike", {
      cache: "no-store",
    });

    if (!res.ok) return;

    const data = await res.json();
    setSlike(data);
  }

  async function uploadSlike() {
    if (files.length === 0) {
      alert("Odaberi jednu ili više slika");
      return;
    }

    if (tip === "OBJEKT" && !objektId) {
      alert("Odaberi objekt");
      return;
    }

    if (tip === "JEDINICA" && !jedinicaId) {
      alert("Odaberi jedinicu");
      return;
    }

    if (tip === "DASHBOARD" && !dashboard && !pocetna) {
      alert("Označi barem Dashboard ili Početna");
      return;
    }

    setLoading(true);
    setUploadInfo("");

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("file", files[i]);

        if (tip === "OBJEKT") {
          formData.append("objektId", objektId);
          formData.append("dashboard", "false");
          formData.append("pocetna", "false");
        }

        if (tip === "JEDINICA") {
          formData.append("jedinicaId", jedinicaId);
          formData.append("dashboard", "false");
          formData.append("pocetna", "false");
        }

        if (tip === "DASHBOARD") {
          formData.append("dashboard", String(dashboard));
          formData.append("pocetna", String(pocetna));
        }

        setUploadInfo(`Spremam ${i + 1} / ${files.length}...`);

        const res = await fetch("/api/slike/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(text);
          alert(`Greška kod uploada slike: ${files[i].name}`);
          setLoading(false);
          return;
        }
      }

      setFiles([]);
      setFileInputKey((v) => v + 1);

      // Namjerno NE brišemo objektId, jedinicaId, dashboard i pocetna.
      // Tako možeš odmah dodati drugu sliku za isti objekt/jedinicu.

      await ucitajSlike();

      alert(
        files.length === 1
          ? "Slika je spremljena"
          : `Spremljeno je ${files.length} slika`
      );
    } finally {
      setLoading(false);
      setUploadInfo("");
    }
  }

  async function updateSlika(id: string, data: Partial<Slika>) {
    const stara = slike.find((s) => s.id === id);
    if (!stara) return;

    const res = await fetch(`/api/slike/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aktivna: data.aktivna ?? stara.aktivna,
        prikaziNaPocetnoj: data.prikaziNaPocetnoj ?? stara.prikaziNaPocetnoj,
        prikaziNaDashboardu:
          data.prikaziNaDashboardu ?? stara.prikaziNaDashboardu,
        sortOrder: data.sortOrder ?? stara.sortOrder,
      }),
    });

    if (!res.ok) {
      alert("Greška kod spremanja");
      return;
    }

    await ucitajSlike();
  }

  async function obrisiSliku(id: string) {
    if (!confirm("Obrisati sliku?")) return;

    const res = await fetch(`/api/slike/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      alert("Greška kod brisanja");
      return;
    }

    await ucitajSlike();
  }

  function nazivSlike(slika: Slika) {
    if (slika.jedinica) {
      return `${slika.jedinica.objekt.naziv} · ${slika.jedinica.naziv}`;
    }

    if (slika.objekt) {
      return slika.objekt.naziv;
    }

    if (slika.prikaziNaDashboardu || slika.prikaziNaPocetnoj) {
      return "Dashboard / početna";
    }

    return "Slika";
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
              Slike objekata i dashboarda
            </h1>

            <p className="mt-3 text-[#6f665a]">
              Ovdje uploadaš slike po objektu, po jedinici ili posebno za
              dashboard / početnu.
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
            Upload nove slike
          </h2>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-black text-[#5f5549]">
                Gdje ide slika?
              </label>

              <select
                value={tip}
                onChange={(e) => {
                  const noviTip = e.target.value as TipSlike;
                  setTip(noviTip);

                  if (noviTip === "DASHBOARD") {
                    setDashboard(true);
                    setPocetna(false);
                  } else {
                    setDashboard(false);
                    setPocetna(false);
                  }
                }}
                className="w-full cursor-pointer border border-[#d8c7aa] bg-white p-3 font-bold text-[#2e2923]"
              >
                <option value="OBJEKT">Objekt</option>
                <option value="JEDINICA">Jedinica / apartman</option>
                <option value="DASHBOARD">Dashboard / početna</option>
              </select>
            </div>

            {tip === "OBJEKT" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#5f5549]">
                  Odaberi objekt
                </label>

                <select
                  value={objektId}
                  onChange={(e) => setObjektId(e.target.value)}
                  className="w-full cursor-pointer border border-[#d8c7aa] bg-white p-3 font-bold text-[#2e2923]"
                >
                  <option value="">-- odaberi objekt --</option>
                  {objekti.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.naziv}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tip === "JEDINICA" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#5f5549]">
                  Odaberi jedinicu
                </label>

                <select
                  value={jedinicaId}
                  onChange={(e) => setJedinicaId(e.target.value)}
                  className="w-full cursor-pointer border border-[#d8c7aa] bg-white p-3 font-bold text-[#2e2923]"
                >
                  <option value="">-- odaberi jedinicu --</option>
                  {jedinice.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.objekt.naziv} · {j.naziv}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tip === "DASHBOARD" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#5f5549]">
                  Prikaz slike
                </label>

                <div className="space-y-3 border border-[#d8c7aa] bg-[#fbf8f2] p-3">
                  <label className="flex cursor-pointer items-center gap-2 font-bold text-[#2e2923]">
                    <input
                      type="checkbox"
                      checked={dashboard}
                      onChange={(e) => setDashboard(e.target.checked)}
                    />
                    Prikaži na dashboardu
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 font-bold text-[#2e2923]">
                    <input
                      type="checkbox"
                      checked={pocetna}
                      onChange={(e) => setPocetna(e.target.checked)}
                    />
                    Prikaži na početnoj
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-black text-[#5f5549]">
                Odaberi slike
              </label>

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
                  Odabrano: {files.length}{" "}
                  {files.length === 1 ? "slika" : "slika"}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={uploadSlike}
            disabled={loading}
            className="mt-6 cursor-pointer bg-[#0b252b] px-7 py-3 font-black text-white hover:bg-[#163941] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? uploadInfo || "Spremam..."
              : files.length > 1
                ? `Upload ${files.length} slika`
                : "Upload slike"}
          </button>
        </section>

        <section className="border border-[#e4d6c0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-2xl font-black text-[#2e2923]">
            Spremljene slike
          </h2>

          {slike.length === 0 ? (
            <div className="mt-6 border border-dashed border-[#d8c7aa] bg-[#fbf8f2] p-8 text-center text-[#6f665a]">
              Još nema uploadanih slika.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {slike.map((slika) => (
                <div
                  key={slika.id}
                  className="overflow-hidden border border-[#e4d6c0] bg-[#fbf8f2]"
                >
                  <div className="h-56 bg-[#ddd]">
                    <img
                      src={slika.url}
                      alt="Slika"
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="p-4">
                    <div className="text-lg font-black text-[#2e2923]">
                      {nazivSlike(slika)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black uppercase">
                      {slika.aktivna ? (
                        <span className="bg-green-100 px-2 py-1 text-green-800">
                          Aktivna
                        </span>
                      ) : (
                        <span className="bg-red-100 px-2 py-1 text-red-800">
                          Ugašena
                        </span>
                      )}

                      {slika.prikaziNaDashboardu && (
                        <span className="bg-blue-100 px-2 py-1 text-blue-800">
                          Dashboard
                        </span>
                      )}

                      {slika.prikaziNaPocetnoj && (
                        <span className="bg-yellow-100 px-2 py-1 text-yellow-800">
                          Početna
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <label className="flex cursor-pointer items-center gap-2 font-bold text-[#5f5549]">
                        <input
                          type="checkbox"
                          checked={slika.aktivna}
                          onChange={(e) =>
                            updateSlika(slika.id, {
                              aktivna: e.target.checked,
                            })
                          }
                        />
                        Aktivna
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 font-bold text-[#5f5549]">
                        <input
                          type="checkbox"
                          checked={slika.prikaziNaDashboardu}
                          onChange={(e) =>
                            updateSlika(slika.id, {
                              prikaziNaDashboardu: e.target.checked,
                            })
                          }
                        />
                        Dashboard
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 font-bold text-[#5f5549]">
                        <input
                          type="checkbox"
                          checked={slika.prikaziNaPocetnoj}
                          onChange={(e) =>
                            updateSlika(slika.id, {
                              prikaziNaPocetnoj: e.target.checked,
                            })
                          }
                        />
                        Početna
                      </label>

                      <label className="font-bold text-[#5f5549]">
                        Redoslijed
                        <input
                          type="number"
                          defaultValue={slika.sortOrder}
                          onBlur={(e) =>
                            updateSlika(slika.id, {
                              sortOrder: Number(e.target.value || 0),
                            })
                          }
                          className="mt-1 w-full border border-[#d8c7aa] bg-white p-2"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => obrisiSliku(slika.id)}
                      className="mt-4 w-full cursor-pointer border border-red-200 bg-white px-4 py-2 font-black text-red-700 hover:bg-red-50"
                    >
                      Obriši sliku
                    </button>
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