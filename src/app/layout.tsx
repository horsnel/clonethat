import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clonethat — clone any website, rebuild it clean",
  description:
    "Clone any site with headless Chromium, replay hidden UI states, and rebuild pages as clean Tailwind HTML + React with AI. Ephemeral by default — clones self-destruct in 24h.",
  keywords: ["website cloner", "AI rebuild", "tailwind", "react", "clonethat", "web tools"],
  openGraph: {
    title: "Clonethat — clone any website, rebuild it clean",
    description:
      "Headless rendering, interaction replay, multi-page crawl, AI rebuild to Tailwind + React.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* brand wordmark font — degrades to the system mono stack offline */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
