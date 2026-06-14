import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 px-4 py-10 text-center text-sm text-casa-taupe">
      <div className="mx-auto max-w-6xl">
        <p className="font-serif text-lg font-bold text-casa-cream">Casa Companion</p>
        <p className="mt-2">Made with coffee, AI, and a dream to give kids something better than screens.</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/demo" className="hover:text-casa-gold">Demo</Link>
          <a href="#pricing" className="hover:text-casa-gold">Pricing</a>
          <a href="mailto:hello@casacompanion.com" className="hover:text-casa-gold">Contact</a>
        </div>
        <p className="mt-6">© {new Date().getFullYear()} Casa Companion. All rights reserved.</p>
      </div>
    </footer>
  );
}
