import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Starknet Agentic | The Sovereign Agentic Era",
  description:
    "Build sovereign AI agents on Starknet. Verifiable computation, on-chain identity, trustless collaboration. The infrastructure layer for the agentic economy.",
  keywords: [
    "starknet",
    "ai agents",
    "autonomous agents",
    "zk proofs",
    "agentic economy",
    "verifiable computation",
    "on-chain identity",
    "defi",
    "cairo",
  ],
  openGraph: {
    title: "Starknet Agentic | The Sovereign Agentic Era",
    description:
      "Build sovereign AI agents on Starknet. Verifiable computation, on-chain identity, trustless collaboration.",
    url: "https://starknet-agentic.com",
    siteName: "Starknet Agentic",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Starknet Agentic | The Sovereign Agentic Era",
    description:
      "Build sovereign AI agents on Starknet. Verifiable computation, on-chain identity, trustless collaboration.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
