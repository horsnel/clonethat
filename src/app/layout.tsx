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
  title: "CloneForge — Clone any website in seconds",
  description:
    "The most powerful website cloner: deep asset cloning, tech-stack analysis, live preview and one-click ZIP export.",
  keywords: ["website cloner", "site mirroring", "asset download", "CloneForge", "web tools"],
  openGraph: {
    title: "CloneForge — Clone any website in seconds",
    description: "Deep asset cloning, stack analysis, live preview, one-click export.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
