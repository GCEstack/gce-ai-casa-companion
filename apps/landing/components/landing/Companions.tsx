import Image from "next/image";
import { characters } from "@/lib/characters";

export function Companions() {
  const featured = characters.slice(0, 10);

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">
          Meet the Companions
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-casa-taupe">
          Each Casa Companion has a unique personality, voice, and way of connecting with your child.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {featured.map((c) => (
            <div
              key={c.key}
              className="group flex flex-col items-center rounded-2xl border border-casa-border bg-casa-card p-4 transition hover:border-casa-gold/40 hover:bg-casa-gold/5"
            >
              <div className="relative h-20 w-20 overflow-hidden rounded-full">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  className="object-contain p-1 transition group-hover:scale-105"
                />
              </div>
              <h3 className="mt-3 font-serif text-base font-bold text-casa-goldLight">{c.name}</h3>
              <p className="text-xs italic text-casa-taupe">{c.meaning}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
