"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Home, LayoutDashboard, LineChart, Newspaper, Swords } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "Break", icon: Swords, primary: true },
  { href: "/market", label: "Markets", icon: Newspaper },
  { href: "/trading", label: "Positions", icon: LineChart },
  { href: "/alerts", label: "Activity", icon: Bell },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#12141b] bg-[#06070a]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-around gap-1 px-1 py-1.5">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active =
            pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
          if (it.primary) {
            return (
              <li key={it.href} className="flex-1">
                <Link
                  href={it.href}
                  className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full font-semibold shadow-[0_6px_16px_-6px_rgba(240,185,11,0.6)] transition ${
                    active
                      ? "bg-[#f8d33a] text-[#08090c]"
                      : "bg-[#f0b90b] text-[#08090c]"
                  }`}
                  aria-label={it.label}
                >
                  <Icon size={18} />
                </Link>
                <div className="mt-0.5 text-center text-[9px] font-semibold uppercase tracking-widest text-[#f0b90b]">
                  {it.label}
                </div>
              </li>
            );
          }
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-0.5 py-1 text-[9px] font-semibold uppercase tracking-widest transition ${
                  active ? "text-white" : "text-[#5e6472]"
                }`}
              >
                <Icon
                  size={16}
                  className={active ? "text-[#f0b90b]" : "text-[#7a8091]"}
                />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
