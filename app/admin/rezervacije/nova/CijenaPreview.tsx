"use client";

import { useMemo, useState } from "react";

type Props = {
  osnovnaCijena: number;
  defaultAkontacijaPostotak: number;
};

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} €`;
}

export default function CijenaPreview({
  osnovnaCijena,
  defaultAkontacijaPostotak,
}: Props) {
  const [popustPostotak, setPopustPostotak] = useState("");
  const [dogovoreniIznos, setDogovoreniIznos] = useState("");

  const izracun = useMemo(() => {
    const popust = Number(String(popustPostotak).replace(",", ".") || 0);
    const rucno = Number(String(dogovoreniIznos).replace(",", ".") || 0);

    if (rucno > 0) {
      return {
        konacno: rucno,
        popustIznos: Math.max(osnovnaCijena - rucno, 0),
        opis: "Ručna dogovorena cijena ima prednost.",
      };
    }

    if (popust > 0) {
      const popustIznos = (osnovnaCijena * popust) / 100;
      const konacno = osnovnaCijena - popustIznos;

      return {
        konacno,
        popustIznos,
        opis: `Primijenjen popust ${popust}%`,
      };
    }

    return {
      konacno: osnovnaCijena,
      popustIznos: 0,
      opis: "Bez popusta.",
    };
  }, [osnovnaCijena, popustPostotak, dogovoreniIznos]);

  const akontacija = (izracun.konacno * defaultAkontacijaPostotak) / 100;
  const ostatak = Math.max(izracun.konacno - akontacija, 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
            Popust %
          </div>
          <input
            name="popustPostotak"
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="npr. 10"
            value={popustPostotak}
            onChange={(e) => setPopustPostotak(e.target.value)}
            className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-[#7a5a22]">
            Ručna dogovorena cijena
          </div>
          <input
            name="dogovoreniIznos"
            type="number"
            min={0}
            step="0.01"
            placeholder="ako se dogovorite ručno"
            value={dogovoreniIznos}
            onChange={(e) => setDogovoreniIznos(e.target.value)}
            className="w-full border border-[#d8c8aa] bg-white px-3 py-2 text-[#2e2923] outline-none"
          />
        </label>
      </div>

      <div className="border border-[#d8c8aa] bg-[#fff6e2] p-4">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a641d]">
          Cijena nakon popusta / dogovora
        </div>

        <div className="mt-1 text-3xl font-black text-[#2e2923]">
          {money(izracun.konacno)}
        </div>

        <div className="mt-1 text-sm text-[#6f665a]">{izracun.opis}</div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className="border border-[#e7dece] bg-white p-3">
            <div className="text-xs font-bold text-[#8a8175]">
              Osnovna cijena
            </div>
            <div className="font-black text-[#2e2923]">
              {money(osnovnaCijena)}
            </div>
          </div>

          <div className="border border-[#e7dece] bg-white p-3">
            <div className="text-xs font-bold text-[#8a8175]">
              Popust
            </div>
            <div className="font-black text-[#2e2923]">
              {money(izracun.popustIznos)}
            </div>
          </div>

          <div className="border border-[#e7dece] bg-white p-3">
            <div className="text-xs font-bold text-[#8a8175]">
              Akontacija {defaultAkontacijaPostotak}%
            </div>
            <div className="font-black text-[#2e2923]">
              {money(akontacija)}
            </div>
          </div>

          <div className="border border-[#e7dece] bg-white p-3">
            <div className="text-xs font-bold text-[#8a8175]">
              Ostatak
            </div>
            <div className="font-black text-[#2e2923]">
              {money(ostatak)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}