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
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛵</span>
              <span className="text-sm font-bold tracking-tight text-amber-950">
                BBSR Liquor Delivery
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  PROTOTYPE · MOCK DATA
                </span>
              </span>
            </div>
            <nav className="flex gap-1 text-sm">
              {personas.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-amber-100 hover:text-amber-900"
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
