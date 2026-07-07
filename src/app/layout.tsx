import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhubaneswar Liquor Delivery — Prototype",
  description:
    "Local marketplace prototype for licensed liquor shops in Bhubaneswar (mock data)",
};

const personas = [
  { href: "/", label: "Customer" },
  { href: "/shop", label: "Shop Owner" },
  { href: "/rider", label: "Rider" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full text-stone-900">
        <header className="sticky top-0 z-40 border-b border-amber-200 bg-[#fffaf0]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg">🛵</span>
              <span className="whitespace-nowrap text-sm font-bold tracking-tight text-amber-950">
                BBSR Liquor Delivery
                <span className="ml-2 hidden rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 sm:inline">
                  PROTOTYPE · MOCK DATA
                </span>
              </span>
            </div>
            <nav className="-mx-1 flex max-w-full gap-0.5 overflow-x-auto text-xs sm:gap-1 sm:text-sm">
              {personas.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="whitespace-nowrap rounded-lg px-2 py-1 font-medium text-stone-600 hover:bg-amber-100 hover:text-amber-900 sm:px-3 sm:py-1.5"
                >
                  {p.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
