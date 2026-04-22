import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BeeldenSearch — archival search for Dutch audiovisual heritage",
  description:
    "A CLARIAH Media Suite-inspired search demo over the Openbeelden archive, with multimodal retrieval, entity networks, and open-source LLM exploration.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrument.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-parchment text-ink antialiased selection:bg-ochre/40 selection:text-ink">
        {children}
      </body>
    </html>
  );
}
