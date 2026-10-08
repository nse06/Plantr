import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo, buttonClass } from "@/components/ui";
import { HideOn } from "@/components/HideOn";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: { default: "Plantr: your garden, planned", template: "%s · Plantr" },
  description:
    "Snap a photo of your space, tell us what you want to grow, and Plantr tells you exactly what to plant, where to put it, and when to do it.",
  applicationName: "Plantr",
  // "Add to Home Screen" on iPhone opens Plantr full-screen, like an installed app.
  appleWebApp: { capable: true, title: "Plantr", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Plantr: your garden, planned",
    description: "A personalized garden plan in minutes: layout, planting calendar, shopping list and weekly reminders.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6b3b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/85 backdrop-blur-md no-print">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
            <Link href="/" aria-label="Plantr home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-1.5 sm:gap-3">
              {/* Wider screens only: the phone header has room for two buttons. */}
              <span className="hidden sm:block">
                <Link href="/explore" className={buttonClass("ghost", "sm")}>
                  Explore
                </Link>
              </span>
              {user ? (
                <Link href="/garden" className={buttonClass("ghost", "sm")}>
                  My Garden
                </Link>
              ) : (
                <Link href="/login" className={buttonClass("ghost", "sm")}>
                  Sign in
                </Link>
              )}
              <Link href="/plan/new" className={buttonClass("primary", "sm")}>
                Plan a garden
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <HideOn paths={["/plan/new"]}>
          <footer className="border-t border-line bg-paper/60 no-print">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Logo className="text-lg" />
                <p className="mt-1">Garden plans for U.S. gardeners, tuned to your ZIP code&apos;s frost dates.</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Link href="/plan/new" className="hover:text-ink">
                  Plan a garden
                </Link>
                <Link href="/explore" className="hover:text-ink">
                  Explore gardens
                </Link>
                {user ? (
                  <Link href="/account" className="hover:text-ink">
                    Account
                  </Link>
                ) : (
                  <Link href="/login" className="hover:text-ink">
                    Sign in
                  </Link>
                )}
                <Link href="/privacy" className="hover:text-ink">
                  Privacy
                </Link>
              </div>
            </div>
          </footer>
        </HideOn>
      </body>
    </html>
  );
}
