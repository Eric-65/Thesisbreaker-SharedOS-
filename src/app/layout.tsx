import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThesisBreaker — Break a decision before an agent acts on it",
  description:
    "ThesisBreaker is a decision-verification service for autonomous agents on SharedOS. Any agent can submit a thesis, claim or decision and receive a structured verdict: assumptions, contradictions, risks and invalidation conditions.",
  openGraph: {
    title: "ThesisBreaker — Decision Verification for Autonomous Agents",
    description:
      "Break a decision before an agent acts on it. Two SharedOS Arena services: break_thesis (10 credits) and verify_claim (5 credits).",
    type: "website",
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#0b0d12'/><path d='M8 22L14 10L18 18L24 10' fill='none' stroke='#f0b90b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
          ),
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
