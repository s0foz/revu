import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Revu — client portals for agencies",
    template: "%s · Revu",
  },
  description:
    "Give every client a branded login to review deliverables, approve work and leave feedback in one place.",
};

/**
 * Cache Components is enabled in next.config.ts, so every route needs a static
 * shell. Reading the Clerk session is a request-time read, which means it must
 * happen inside a Suspense boundary. This one covers the whole app; the
 * fallback below is what gets prerendered.
 */
function AppShellFallback() {
  return <div className="min-h-full" aria-hidden />;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <Suspense fallback={<AppShellFallback />}>{children}</Suspense>
        </ClerkProvider>
      </body>
    </html>
  );
}
