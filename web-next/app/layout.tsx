import type { Metadata } from "next";
import { Nunito, Playfair_Display } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["300", "400", "600", "700", "800"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Casa Companion — AI Plush Toy for Kids",
  description:
    "A screen-free AI companion that listens, tells stories, teaches languages, and grows with your child. Coming to Kickstarter May 5, 2026.",
  openGraph: {
    title: "Casa Companion — AI Plush Toy for Kids",
    description: "Talk to an AI companion right now. Live demo of Casa Companion.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-casa-dark text-casa-cream antialiased">{children}</body>
    </html>
  );
}
