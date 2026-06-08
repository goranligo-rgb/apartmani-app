"use client";

import { useMemo, useState, type DragEvent } from "react";

type Objekt = {
  id: string;
  naziv: string;
};

type Jedinica = {
  id: string;
  naziv: string;
  objektId: string;
};

type Slika = {
  id: string;
  url: string;
  aktivna: boolean;
  prikaziNaDashboardu: boolean;
  sortOrder: number;
  objektId: string | null;
  jedinicaId: string | null;
};

// Redoslijed tabova po želji korisnika; nepoznati nazivi na kraj, abecedno.
const REDOSLIJED_OBJEKATA = [
  "Apartments Eva",
  "Luxury Apartments Marty",
  "House Art",
];

// Pomakni element `dragId` na poziciju elementa `targetId` (čisti reorder).
function preslozi(lista: Slika[], dragId: string, targetId: string): Slika[] {
  if (dragId === targetId) return lista;

  const od = lista.findIndex((s) => s.id === dragId);
  const doIdx = lista.findIndex((s) => s.id === targetId);
  if (od === -1 || doIdx === -1) return lista;

  const kopija = [...lista];
  const [pomaknuti] = kopija.splice(od, 1);
  kopija.splice(doIdx, 0, pomaknuti);
  return kopija;
}

export default function AdminSlikeGalerijaClient({
  objekti,
  jedinice,
  slike: pocetneSlike,
}: {
  objekti: Objekt[];
  jedinice: Jedinica[];
  slike: Slika[];
}) {
  const [slike, setSlike] = useState<Slika[]>(pocetneSlike);
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // Drag&drop stanje: koja se kartica vuče i nad kojom je trenutno (drop meta).
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Tabovi poredani prema REDOSLIJED_OBJEKATA.
  const tabObjekti = useMemo(() => {
    const arr = [...objekti];
    arr.sort((a, b) => {
      const ia = REDOSLIJED_OBJEKATA.indexOf(a.naziv);
      const ib = REDOSLIJED_OBJEKATA.indexOf(b.naziv);
      return (
        (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) ||
        a.naziv.localeCompare(b.naziv)
      );
    });
    return arr;
  }, [objekti]);

  const [aktivniTab, setAktivniTab] = useState<string>("");
  const tab = aktivniTab || tabObjekti[0]?.id || "";

  // Mapa jedinicaId → objektId (za objekt-kontekst jedinica-redova).
  const jediniceObjektId = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jedinice) m.set(j.id, j.objektId);
    return m;
  }, [jedinice]);

  // Slike trenutnog taba = objekt-set (objektId===tab ILI jedinica.objektId===tab),
  // poredane po sortOrder.
  const slikeTaba = useMemo(() => {
    const objektOd = (s: Slika): string | null =>
      s.jedinicaId
        ? jediniceObjektId.get(s.jedinicaId) ?? s.objektId ?? null
        : s.objektId ?? null;

    return slike
      .filter((s) => objektOd(s) === tab)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [slike, tab, jediniceObjektId]);

  // Jedinice trenutnog objekta (za izbornik na kartici).
  const jediniceTaba = useMemo(
    () => jedinice.filter((j) => j.objektId === tab),
    [jedinice, tab]
  );

  async function reload() {
    const res = await fetch("/api/slike", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSlike(data);
  }

  async function patchSliku(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/slike/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      alert("Greška kod spremanja izmjene.");
      return;
    }

    await reload();
  }

  async function obrisiSliku(id: string) {
    if (!confirm("Obrisati ovu sliku?")) return;

    const res = await fetch(`/api/slike/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Greška kod brisanja.");
      return;
    }

    await reload();
  }

  async function uploadSlike() {
    if (files.length === 0) {
      alert("Odaberi jednu ili više slika");
      return;
    }
    if (!tab) {
      alert("Nema odabranog objekta.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      formData.append("objektId", tab); // upload ravno u objekt ovog taba (F1)

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
      await reload();
    } finally {
      setLoading(false);
    }
  }

  // POST novi redoslijed za objekt ovog taba, pa osvježi listu.
  async function spremiRedoslijed(redoslijed: string[]) {
    const res = await fetch("/api/slike/redoslijed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objektId: tab, redoslijed }),
    });

    if (!res.ok) {
      alert("Greška kod spremanja redoslijeda.");
    }

    await reload();
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    // setData je nužan da drag uopće krene u nekim preglednicima (npr. Firefox).
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOverCard(e: DragEvent<HTMLDivElement>, id: string) {
    if (!draggedId) return;
    e.preventDefault(); // dozvoli drop
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  }

  async function handleDropCard(e: DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();

    const dragId = draggedId;
    setDraggedId(null);
    setOverId(null);

    if (!dragId || dragId === targetId) return;

    const noviNiz = preslozi(slikeTaba, dragId, targetId);
    const noviIds = noviNiz.map((s) => s.id);

    // Optimistično: lokalno postavi sortOrder po novom nizu da se promjena
    // odmah vidi; POST + reload zatim uskladi sa serverom.
    const pozicija = new Map(noviIds.map((id, i) => [id, i] as const));
    setSlike((prev) =>
      prev.map((s) =>
        pozicija.has(s.id) ? { ...s, sortOrder: pozicija.get(s.id)! } : s
      )
    );

    await spremiRedoslijed(noviIds);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setOverId(null);
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
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[#9b7a4c]">
              Admin
            </p>
            <h1 className="text-4xl font-black text-[#2e2923]">
              Galerija slika po objektu
            </h1>
            <p className="mt-3 text-[#6f665a]">
              Odaberi objekt, dodaj slike i uredi prikaz. Povuci kartice za
              promjenu redoslijeda.
            </p>
          </div>

          <a
            href="/admin"
            className="cursor-pointer border border-[#d8c7aa] bg-white px-5 py-3 text-sm font-black text-[#2e2923] hover:bg-[#fbf8f2]"
          >
            ← Admin dashboard
          </a>
        </div>

        {/* Tabovi */}
        <div className="mb-6 flex flex-wrap gap-2">
          {tabObjekti.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setAktivniTab(o.id)}
              className={`cursor-pointer border px-5 py-3 text-sm font-black ${
                o.id === tab
                  ? "border-[#0b252b] bg-[#0b252b] text-white"
                  : "border-[#d8c7aa] bg-white text-[#2e2923] hover:bg-[#fbf8f2]"
              }`}
            >
              {o.naziv}
            </button>
          ))}
        </div>

        {/* Upload u ovaj objekt */}
        <section className="mb-6 border border-[#e4d6c0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-xl font-black text-[#2e2923]">Dodaj slike</h2>
          <div className="mt-1 text-sm font-bold text-[#6f665a]">
            Učitavaju se ravno u objekt:{" "}
            <span className="text-[#2e2923]">
              {tabObjekti.find((o) => o.id === tab)?.naziv ?? "—"}
            </span>{" "}
            (padaju na kraj galerije).
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="cursor-pointer border border-[#d8c7aa] bg-white p-3 text-[#2e2923] file:mr-4 file:cursor-pointer file:border-0 file:bg-[#0b252b] file:px-4 file:py-2 file:font-black file:text-white"
            />

            <button
              type="button"
              onClick={uploadSlike}
              disabled={loading || !tab}
              className="cursor-pointer bg-[#0b252b] px-7 py-3 font-black text-white hover:bg-[#163941] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Spremam..." : "Upload"}
            </button>

            {files.length > 0 && (
              <span className="text-sm font-bold text-[#6f665a]">
                Odabrano: {files.length}
              </span>
            )}
          </div>
        </section>

        {/* Kartice slika objekta */}
        <section className="border border-[#e4d6c0] bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <h2 className="text-xl font-black text-[#2e2923]">
            Slike objekta{" "}
            <span className="text-[#9b7a4c]">({slikeTaba.length})</span>
          </h2>

          {slikeTaba.length === 0 ? (
            <div className="mt-6 border border-dashed border-[#d8c7aa] bg-[#fbf8f2] p-8 text-center text-[#6f665a]">
              Nema slika za ovaj objekt.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slikeTaba.map((s) => {
                const jeVuceni = draggedId === s.id;
                const jeMeta =
                  !!draggedId && draggedId !== s.id && overId === s.id;
                const opacityCls = jeVuceni
                  ? "opacity-40"
                  : s.aktivna
                    ? ""
                    : "opacity-50";

                return (
                  <div
                    key={s.id}
                    onDragOver={(e) => handleDragOverCard(e, s.id)}
                    onDrop={(e) => handleDropCard(e, s.id)}
                    className={`flex flex-col border bg-[#fbf8f2] p-3 ${opacityCls} ${
                      jeMeta
                        ? "border-[#0b252b] outline outline-2 outline-[#0b252b]"
                        : "border-[#e4d6c0]"
                    }`}
                  >
                    {/* Drag-ručka: samo ona je draggable (kartica je drop-zona),
                        da se ne sukobljava s klikom na checkbox/select. */}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      onDragEnd={handleDragEnd}
                      title="Povuci za promjenu redoslijeda"
                      className="mb-2 flex cursor-move select-none items-center justify-center gap-2 border border-dashed border-[#d8c7aa] bg-white py-1 text-xs font-black text-[#9b7a4c]"
                    >
                      ⠿ Povuci
                    </div>

                    <div className="h-44 overflow-hidden bg-[#ddd]">
                      <img
                        src={s.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 font-black text-[#2e2923]">
                        <input
                          type="checkbox"
                          checked={s.aktivna}
                          onChange={(e) =>
                            patchSliku(s.id, { aktivna: e.target.checked })
                          }
                        />
                        Aktivna
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 font-black text-[#2e2923]">
                        <input
                          type="checkbox"
                          checked={s.prikaziNaDashboardu}
                          onChange={(e) =>
                            patchSliku(s.id, {
                              prikaziNaDashboardu: e.target.checked,
                            })
                          }
                        />
                        Hero
                      </label>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-sm font-bold text-[#6f665a]">
                        Jedinica:
                      </span>
                      <select
                        value={s.jedinicaId ?? ""}
                        onChange={(e) =>
                          patchSliku(s.id, {
                            jedinicaId: e.target.value || null,
                          })
                        }
                        className="border border-[#d8c7aa] bg-white px-2 py-1 text-sm text-[#2e2923]"
                      >
                        <option value="">— (cijeli objekt)</option>
                        {jediniceTaba.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.naziv}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#9b7a4c]">
                        sort: {s.sortOrder}
                        {!s.aktivna ? " · neaktivna" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => obrisiSliku(s.id)}
                        className="cursor-pointer border border-red-200 bg-white px-3 py-1 font-black text-red-700 hover:bg-red-50"
                      >
                        Obriši
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
