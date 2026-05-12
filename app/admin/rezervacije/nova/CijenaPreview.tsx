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

  const [tipAkontacije, setTipAkontacije] = useState<"POSTOTAK" | "IZNOS">(
    "POSTOTAK"
  );
  const [vrijednostAkontacije, setVrijednostAkontacije] = useState(
    defaultAkontacijaPostotak
  );

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

  const akontacija =
    tipAkontacije === "POSTOTAK"
      ? (izracun.konacno * vrijednostAkontacije) / 100
      : vrijednostAkontacije;

  const ostatak = Math.max(izracun.konacno - akontacija, 0);

  return (
    <div className="space-y-4 border border-[#ead7b6] bg-[#fff9ef] p-4">
      {/* POPUST I RUČNA CIJENA */}
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <div className="text-xs font-black text-[#7a5a22]">Popust (%)</div>
          <input
            name="popustPostotak"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={popustPostotak}
            onChange={(e) => setPopustPostotak(e.target.value)}
            className="w-full border px-3 py-2"
          />
        </label>

        <label>
          <div className="text-xs font-black text-[#7a5a22]">
            Ručna cijena
          </div>
          <input
            name="dogovoreniIznos"
            type="number"
            step="0.01"
            value={dogovoreniIznos}
            onChange={(e) => setDogovoreniIznos(e.target.value)}
            className="w-full border px-3 py-2"
          />
        </label>
      </div>

      {/* AKONTACIJA */}
      <div className="space-y-3">
        <div className="text-xs font-black text-[#7a5a22]">Akontacija</div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex gap-2 border p-2">
            <input
              type="radio"
              name="tipAkontacije"
              value="POSTOTAK"
              checked={tipAkontacije === "POSTOTAK"}
              onChange={() => setTipAkontacije("POSTOTAK")}
            />
            Postotak
          </label>

          <label className="flex gap-2 border p-2">
            <input
              type="radio"
              name="tipAkontacije"
              value="IZNOS"
              checked={tipAkontacije === "IZNOS"}
              onChange={() => setTipAkontacije("IZNOS")}
            />
            Iznos
          </label>
        </div>

        <input
          name="vrijednostAkontacije"
          type="number"
          step="0.01"
          value={vrijednostAkontacije}
          onChange={(e) =>
            setVrijednostAkontacije(Number(e.target.value || 0))
          }
          className="w-full border px-3 py-2"
        />
      </div>

      {/* PREVIEW */}
      <div className="grid gap-2 md:grid-cols-5">
        <Box label="Osnovna" value={money(osnovnaCijena)} />
        <Box label="Popust" value={money(izracun.popustIznos)} />
        <Box label="Dogovorena" value={money(izracun.konacno)} />
        <Box label="Akontacija" value={money(akontacija)} />
        <Box label="Ostatak" value={money(ostatak)} />
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="border bg-white p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}