import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Companions } from "@/components/landing/Companions";
import { Origin } from "@/components/landing/Origin";
import { VoiceClone } from "@/components/landing/VoiceClone";
import { Comparison } from "@/components/landing/Comparison";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { EmailCapture } from "@/components/landing/EmailCapture";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Companions />
      <Origin />
      <VoiceClone />
      <Comparison />
      <Pricing />
      <FAQ />
      <EmailCapture />
      <Footer />
    </main>
  );
}
