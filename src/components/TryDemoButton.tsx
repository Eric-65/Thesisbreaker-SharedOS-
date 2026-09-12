"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { pushToast } from "./toasts";

/**
 * Fires POST /api/theses/demo to seed the flagship BTC/USDT demo thesis
 * and routes the user into the workspace. Zero setup required from a judge.
 */
export function TryDemoButton({
  variant = "primary",
  label = "Try Demo",
  className,
}: {
  variant?: "primary" | "secondary";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/theses/demo", { method: "POST" });
      const json = await res.json();
      if (json?.ok && json.data?.id) {
        pushToast({
          kind: "agent",
          title: "Demo thesis created",
          body: `${json.data.symbol} · score ${json.data.currentScore}/100`,
        });
        router.push(`/thesis/${json.data.id}`);
      } else {
        pushToast({
          kind: "error",
          title: "Demo failed to start",
          body: json?.error ?? "Please try again.",
        });
        setBusy(false);
      }
    } catch (err) {
      pushToast({
        kind: "error",
        title: "Demo failed to start",
        body: (err as Error).message,
      });
      setBusy(false);
    }
  };

  return (
    <button
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"} ${className ?? ""}`}
      onClick={go}
      disabled={busy}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {label}
    </button>
  );
}
