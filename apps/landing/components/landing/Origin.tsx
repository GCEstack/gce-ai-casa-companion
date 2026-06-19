import Image from "next/image";

export function Origin() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-casa-border">
          <Image
            src="/heroes/nonna.webp"
            alt="Nonna companion"
            fill
            className="object-cover"
          />
        </div>
        <div>
          <h2 className="font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">
            Born from a Living Room Dream
          </h2>
          <p className="mt-4 leading-relaxed text-casa-sand">
            Casa Companion started when our founder wanted his kids to stay close to family voices, heritage languages, and imagination — without another screen.
          </p>
          <p className="mt-4 leading-relaxed text-casa-taupe">
            Every plush is powered by safe, age-appropriate AI. Parents control the content. Grandparents can record stories. And kids get a friend who never rushes bedtime.
          </p>
        </div>
      </div>
    </section>
  );
}
