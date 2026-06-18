import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CASA Voice Agent",
  description: "Toxic, sarcastic, judgmental AI companion with real-time voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script src="/ort-wasm/ort.min.js" strategy="beforeInteractive" />
      </head>
      <body className="antialiased bg-background text-slate-200">
        {children}
      </body>
    </html>
  );
}
