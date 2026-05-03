"use client";

import { useEffect, useState } from "react";

type Slika = {
  id: string;
  url: string;
  naziv?: string | null;
};

export default function DashboardSlider({
  slike,
}: {
  slike: Slika[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!slike || slike.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slike.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [slike]);

  if (!slike || slike.length === 0) return null;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {slike.map((slika, i) => (
        <div
          key={slika.id}
          className="absolute inset-0 bg-cover bg-center transition-all duration-[1000ms]"
          style={{
            backgroundImage: `url('${slika.url}')`,
            opacity: i === index ? 1 : 0,
            transform: i === index ? "scale(1.08)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}