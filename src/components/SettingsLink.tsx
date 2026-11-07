"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Link into Settings that remembers where you were, so closing Settings brings you back. */
export function SettingsLink(props: Omit<React.ComponentProps<typeof Link>, "href">) {
  const pathname = usePathname();
  const from = pathname && !pathname.startsWith("/settings") ? `?from=${encodeURIComponent(pathname)}` : "";
  return <Link href={`/settings${from}`} {...props} />;
}
