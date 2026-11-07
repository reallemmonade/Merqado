import type { Metadata } from "next";
import { htmlAttrs, THEME_SCRIPT } from "@/lib/prefs";
import { getPrefs } from "@/lib/prefs.server";
import { GuavaSky } from "@/components/GuavaSky";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merqado",
  description: "The engagement workspace for consulting teams",
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
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <GuavaSky initial={prefs} />
        {children}
      </body>
    </html>
  );
}
