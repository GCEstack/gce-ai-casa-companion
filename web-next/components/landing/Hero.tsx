import Image from "next/image";
import Link from "next/link";
import { Countdown } from "./Countdown";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(212,160,23,0.12),transparent_60%)]" />
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-casa-red">
        Kickstarter Launch May 5, 2026
      </p>
      <h1 className="max-w-3xl font-serif text-4xl font-black leading-tight text-gold-gradient sm:text-6xl">
        A Plush Friend That Listens, Speaks & Grows
      </h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-casa-taupe sm:text-lg">
        Casa Companion is a screen-free AI plush toy that tells stories, teaches languages, and keeps your child company — voiced by the people who love them most.
      </p>
      <div className="mt-8">
        <Countdown />
      </div>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/demo"
          className="rounded-full bg-gradient-to-r from-casa-gold to-[#B8860B] px-8 py-4 font-sans font-extrabold text-casa-dark shadow-lg shadow-casa-gold/20 transition hover:scale-105"
        >
          Try the Live Demo
        </Link>
        <a
          href="#pricing"
          className="rounded-full border border-white/10 bg-white/5 px-8 py-4 font-sans font-bold text-casa-cream transition hover:bg-white/10"
        >
          Back on Kickstarter
        </a>
      </div>
      <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {["/heroes/crow.webp", "/heroes/owl.webp", "/heroes/bear.webp", "/heroes/bunny.webp"].map((src) => (
          <div
            key={src}
            className="relative h-28 w-28 overflow-hidden rounded-2xl border border-casa-border bg-casa-card p-3 sm:h-36 sm:w-36"
          >
            <Image src={src} alt="companion" fill className="object-contain p-2" />
          </div>
        ))}
      </div>
    </section>
  );
}
