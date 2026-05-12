"use client";

export default function LogoutButton() {
  function handleLogout() {
    window.location.href = "/api/admin/logout";
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-4 inline-block border border-[#d8c8aa] bg-white px-4 py-2 text-sm font-black text-[#7a5a22] transition hover:bg-[#fff6e2]"
    >
      Odjava
    </button>
  );
}