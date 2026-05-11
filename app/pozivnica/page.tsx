export default function PozivnicaPricest() {
  return (
    <div className="min-h-screen bg-[#f8f5ef] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519491050282-cf00c82424b4?q=80&w=1600&auto=format&fit=crop')] bg-cover bg-center opacity-10" />

      <div className="relative w-full max-w-4xl overflow-hidden rounded-[40px] shadow-2xl bg-white border border-stone-200">
        <div className="grid md:grid-cols-2 min-h-[760px]">
          <div className="relative">
            <img
              src="/pozivnica/Martin.png"
              alt="Martin"
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

            <div className="absolute bottom-8 left-8 right-8 text-white">
              <p className="uppercase tracking-[0.35em] text-sm text-stone-200 mb-3">
                Prva sveta pričest
              </p>

              <h1 className="text-5xl font-black drop-shadow-xl mb-2">
                Martin
              </h1>

              <div className="w-24 h-1 rounded-full bg-yellow-300" />
            </div>
          </div>

          <div className="flex flex-col justify-center p-8 md:p-12 relative">
            <div className="absolute top-0 right-0 w-56 h-56 bg-yellow-100 rounded-full blur-3xl opacity-40 -translate-y-24 translate-x-24" />

            <div className="relative z-10">
              <p className="text-stone-500 uppercase tracking-[0.4em] text-sm mb-4">
                Pozivnica
              </p>

              <h2 className="text-4xl md:text-5xl font-serif text-stone-800 leading-tight mb-6">
                S radošću Vas pozivamo
                na slavlje prve svete pričesti
                našeg Martina
              </h2>

              <p className="text-stone-600 leading-relaxed text-lg mb-10">
                Bit će nam velika čast da svojim dolaskom
                uveličate ovaj poseban i svečan trenutak.
              </p>

              <div className="space-y-5 mb-10">
                <div className="rounded-2xl border border-stone-200 p-5 bg-stone-50">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-400 mb-2">
                    Datum
                  </p>
                  <p className="text-2xl font-semibold text-stone-800">
                    Nedjelja, 17.05.2026.
                  </p>
                </div>

                <div className="rounded-2xl border border-stone-200 p-5 bg-stone-50">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-400 mb-2">
                    Vrijeme
                  </p>
                  <p className="text-2xl font-semibold text-stone-800">
                    13:30 sati
                  </p>
                </div>

                <div className="rounded-2xl border border-stone-200 p-5 bg-stone-50">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-400 mb-2">
                    Lokacija
                  </p>
                  <p className="text-2xl font-semibold text-stone-800">
                    Lukovec
                  </p>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden shadow-lg border border-stone-200 mb-10">
                <iframe
                  width="100%"
                  height="200"
                  src="https://www.youtube.com/embed/h2ymJcCwS_s"
                  title="Glazba"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button className="flex-1 py-4 rounded-full bg-emerald-600 hover:bg-emerald-700 transition-all text-white text-lg font-semibold shadow-lg hover:scale-[1.02]">
                  Dolazim ✨
                </button>

                <button className="flex-1 py-4 rounded-full bg-stone-800 hover:bg-black transition-all text-white text-lg font-semibold shadow-lg hover:scale-[1.02]">
                  Ne dolazim
                </button>
              </div>

              <p className="mt-10 text-center text-stone-400 text-sm italic">
                “Pusti dječicu neka dolaze k meni.”
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
