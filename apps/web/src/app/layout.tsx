import type { Metadata } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
