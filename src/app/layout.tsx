import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (per design spec §10: self-host + font-display: swap, Latin subset).
const fraunces = localFont({
  src: "../fonts/fraunces-variable.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});

const inter = localFont({
  src: "../fonts/inter-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const courierPrime = localFont({
  src: [
    { path: "../fonts/courier-prime-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/courier-prime-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-courier-prime",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Heritage Clubhouse",
  description:
    "A golf passport — a warm, paper-and-brass map of the courses you've played, your upcoming rounds, and your bucket list.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
