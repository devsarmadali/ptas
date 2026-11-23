import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PTAS — Punjab Professional Tax Administration System",
    template: "%s | PTAS"
  },
  description:
    "Government of the Punjab — Excise, Taxation & Narcotics Control Department Professional Tax Administration System",
  icons: {
    icon: "/punjab-logo.png",
    shortcut: "/punjab-logo.png",
    apple: "/punjab-logo.png"
  }
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Read per-request CSP nonce header forwarded by proxy.ts so Next.js applies it to SSR scripts
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  void nonce;

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
