type Props = {
  address: string;
  title?: string;
};

export default function ObjectLocation({ address, title }: Props) {
  const encoded = encodeURIComponent(address);

  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  const embedUrl = `https://maps.google.com/maps?q=${encoded}&output=embed`;

  return (
    <section className="mt-10">
      <h2 className="text-4xl font-bold text-[#2e2923]">Lokacija</h2>

      <div className="mt-5 flex items-center gap-2 text-lg text-[#3b332a]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="#c79a57"
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
        </svg>

        <span className="font-semibold">
          {title ? `${title} · ` : ""}
          {address}
        </span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="overflow-hidden border border-[#e4d6c0] bg-white shadow-[0_12px_35px_rgba(0,0,0,0.08)] md:col-span-2">
          <iframe
            src={embedUrl}
            title={`Karta lokacije: ${address}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-[320px] w-full md:h-[380px]"
            style={{ border: 0 }}
            allowFullScreen
          />
        </div>

        <div className="flex flex-col gap-3 md:col-span-1">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#c79a57] px-5 py-4 text-center font-bold text-white transition hover:brightness-95"
          >
            Navigiraj
          </a>

          <a
            href={mapSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#c79a57] bg-white px-5 py-4 text-center font-bold text-[#7a5a22] transition hover:bg-[#fff6e2]"
          >
            Otvori u Google Mapsu
          </a>

          <p className="mt-1 text-sm leading-relaxed text-[#6f665a]">
            Navigacija koristi tvoju trenutnu lokaciju u Google Mapsu i vodi te
            do adrese.
          </p>
        </div>
      </div>
    </section>
  );
}
