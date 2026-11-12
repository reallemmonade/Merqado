import type { Metadata } from "next";
import { htmlAttrs, THEME_SCRIPT } from "@/lib/prefs";
import { getPrefs } from "@/lib/prefs.server";
import { GuavaSky } from "@/components/GuavaSky";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merqado",
  description: "The engagement workspace for consulting teams",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = await getPrefs();
  return (
    <html lang="en" {...htmlAttrs(prefs)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <GuavaSky initial={prefs} />
        {children}
      </body>
    </html>
  );
}
