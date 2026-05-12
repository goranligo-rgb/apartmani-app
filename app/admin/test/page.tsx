"use client";

import SmartCalendar from "@/components/calendar/SmartCalendar";

export default function Page() {
  const rezervacije = [
    { od: "2026-07-10", do: "2026-07-15" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-4">ADMIN kalendar</h1>

      <SmartCalendar
        mode="ADMIN"
        rezervacije={rezervacije}
      />
    </div>
  );
}