import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "./SiteNav";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "COGGS Results",
  description: "Race results and insights for events put on by COGGS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="antialiased">
      <SiteNav />
      <ProgressBar
          height="3px"
          color="#2563eb"
          options={{ showSpinner: false }}
          shallowRouting
        />
      {children}
      <SpeedInsights />
      <Analytics />
    </body>
    </html>
  );
}
