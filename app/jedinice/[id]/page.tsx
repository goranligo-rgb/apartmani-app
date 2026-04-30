import Link from "next/link";

export default async function JedinicaDetaljPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl border border-white/10 bg-white/10 p-8">
        <Link href="/" className="text-emerald-300">
          ← Natrag
        </Link>

        <h1 className="mt-6 text-4xl font-black">Smještaj</h1>

        <p className="mt-3 text-white/70">ID jedinice: {id}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href={`/kalendar?jedinicaId=${id}`}
            className="bg-emerald-400 px-5 py-4 text-center font-black text-black"
          >
            Otvori kalendar
          </Link>

          <Link
            href={`/rezervacije/nova?jedinicaId=${id}`}
            className="bg-white px-5 py-4 text-center font-black text-black"
          >
            Rezerviraj
          </Link>
        </div>
      </div>
    </main>
  );
}