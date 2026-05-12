"use client";

import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok && res.redirected === false) {
      setError("Neispravno korisničko ime ili lozinka.");
      return;
    }

    window.location.href = "/admin";
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 50%, #eadfce 100%)",
        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
      }}
    >
      <div className="w-full max-w-md border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
        <Link href="/" className="mb-4 inline-block text-sm font-bold text-[#9b6b12]">
          ← Povratak na web
        </Link>

        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b7a4c]">
          Admin pristup
        </p>

        <h1 className="mt-2 text-3xl font-black text-[#2e2923]">
          Prijava u dashboard
        </h1>

        <p className="mt-2 text-sm text-[#6f665a]">
          Unesite korisničko ime i lozinku za administraciju.
        </p>

        {error && (
          <div className="mt-4 border border-[#f0c3c1] bg-[#f8d7da] p-3 text-sm font-bold text-[#8a2d2b]">
            {error}
          </div>
        )}

        <form action="/api/admin/login" method="POST" className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
              Korisničko ime
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              required
              autoComplete="username"
              className="w-full border border-[#d8c8aa] bg-[#fbf8f2] p-3 text-sm font-bold outline-none focus:border-[#c79a57]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.15em] text-[#9b7a4c]">
              Lozinka
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-[#d8c8aa] bg-[#fbf8f2] p-3 text-sm font-bold outline-none focus:border-[#c79a57]"
            />
          </div>

          <button
            type="submit"
            className="w-full cursor-pointer bg-[#0b252b] px-5 py-3 text-sm font-black text-white transition hover:brightness-110"
          >
            UĐI U ADMIN
          </button>
        </form>
      </div>
    </main>
  );
}