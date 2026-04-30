"use client";

import { useEffect, useState } from "react";

type Slika = {
  id: string;
  url: string;
  naziv?: string | null;
  opis?: string | null;
};

export default function DashboardSlider() {
  const [slike, setSlike] = useState<Slika[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/slike/dashboard")
      .then((res) => res.json())
      .then((data) => setSlike(data))
      .catch(() => setSlike([]));
  }, []);

  useEffect(() => {
    if (slike.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slike.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [slike.length]);

  if (slike.length === 0) return null;

  const slika = slike[index];

  return (
    <section
      style={{
        width: "100%",
        height: 280,
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.14)",
        background: "#111",
      }}
    >
      <img
        src={slika.url}
        alt={slika.naziv || "Dashboard slika"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          transition: "opacity 0.5s ease",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.58), rgba(0,0,0,0.10))",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 28,
          bottom: 24,
          color: "white",
          fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800 }}>
          Apartmani Malinska
        </div>
        <div style={{ fontSize: 15, opacity: 0.86 }}>
          Pregled objekata, rezervacija i gostiju
        </div>
      </div>

      {slike.length > 1 && (
        <div
          style={{
            position: "absolute",
            right: 20,
            bottom: 18,
            display: "flex",
            gap: 7,
          }}
        >
          {slike.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                border: 0,
                background: i === index ? "white" : "rgba(255,255,255,0.45)",
                cursor: "pointer",
              }}
              aria-label={`Slika ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}