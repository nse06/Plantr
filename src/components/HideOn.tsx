"use client";

import { usePathname } from "next/navigation";

/** Hide chrome (like the site footer) on focused, full-screen flows such as the wizard. */
export function HideOn({ paths, children }: { paths: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  return paths.some((p) => pathname.startsWith(p)) ? null : <>{children}</>;
}
