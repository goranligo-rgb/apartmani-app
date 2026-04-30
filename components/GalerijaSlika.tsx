"use client";

import { useMemo, useState } from "react";

type Slika = {
  id: string;
  url: string;
};

export default function GalerijaSlika({ slike }: { slike: Slika[] }) {
  const [aktivniIndex, setAktivniIndex] = useState<number | null>(null);

  const aktivnaSlika = useMemo(() => {
    if (aktivniIndex === null) return null;
    return slike[aktivniIndex] || null;
  }, [aktivniIndex, slike]);

  function zatvori() {
    setAktivniIndex(null);
  }

  function prethodna(e?: React.MouseEvent) {
    e?.stopPropagation();

    if (aktivniIndex === null) return;

    setAktivniIndex((prev) => {
      if (prev === null) return null;
      return prev === 0 ? slike.length - 1 : prev - 1;
    });
  }

  function sljedeca(e?: React.MouseEvent) {
    e?.stopPropagation();

    if (aktivniIndex === null) return;

    setAktivniIndex((prev) => {
      if (prev === null) return null;
      return prev === slike.length - 1 ? 0 : prev + 1;
    });
  }

  if (!slike || slike.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {slike.map((s, index) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setAktivniIndex(index)}
            className="group relative h-64 cursor-pointer overflow-hidden border border-[#e4d6c0] bg-white p-0 shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
          >
            <img
              src={s.url}
              alt={`Slika objekta ${index + 1}`}
              className="h-full w-full cursor-pointer object-cover transition duration-500 group-hover:scale-105"
            />

            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />

            <div className="absolute bottom-3 right-3 bg-black/60 px-3 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
              Klikni za uvećanje
            </div>
          </button>
        ))}
      </div>

      {aktivnaSlika && aktivniIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] flex cursor-pointer items-center justify-center bg-black/92 p-4"
          onClick={zatvori}
        >
          <div
            className="absolute left-6 top-6 bg-black/50 px-4 py-2 text-sm font-bold text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {aktivniIndex + 1} / {slike.length}
          </div>

          <button
            type="button"
            onClick={zatvori}
            className="absolute right-6 top-6 z-10 cursor-pointer bg-white px-4 py-2 text-2xl font-black text-black transition hover:bg-[#f4efe6]"
            aria-label="Zatvori galeriju"
          >
            ×
          </button>

          {slike.length > 1 && (
            <button
              type="button"
              onClick={prethodna}
              className="absolute left-4 top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-4xl font-black text-black transition hover:bg-white"
              aria-label="Prethodna slika"
            >
              ‹
            </button>
          )}

          <img
            src={aktivnaSlika.url}
            alt={`Uvećana slika ${aktivniIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[92vw] cursor-default object-contain shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
          />

          {slike.length > 1 && (
            <button
              type="button"
              onClick={sljedeca}
              className="absolute right-4 top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-4xl font-black text-black transition hover:bg-white"
              aria-label="Sljedeća slika"
            >
              ›
            </button>
          )}

          <div
            className="absolute bottom-6 left-1/2 max-w-[90vw] -translate-x-1/2 bg-black/55 px-4 py-2 text-center text-sm font-bold text-white"
            onClick={(e) => e.stopPropagation()}
          >
            Klik na tamnu pozadinu zatvara galeriju
          </div>
        </div>
      )}
    </>
  );
}