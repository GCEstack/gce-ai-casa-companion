import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-casa-dark/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-serif text-xl font-black text-casa-goldLight">
          Casa Companion
        </Link>
        <div className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/demo" className="rounded-full bg-casa-gold px-5 py-2 text-casa-dark transition hover:bg-casa-goldLight">
            Try Demo
          </Link>
        </div>
      </div>
    </nav>
  );
}
