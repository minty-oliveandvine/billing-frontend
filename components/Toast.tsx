"use client";

/**
 * Reusable toast notification for the Payment Request app.
 *
 * Visual design mirrors Module 1 (Minty Flask) — a rounded pill with a
 * coloured 5px border, a PNG status icon, a bold label + message, and a close
 * button. Toasts slide in from the right at the top-right of the viewport,
 * stack vertically, and auto-dismiss after 4s.
 *
 * Usage:
 *   1. Wrap the app once (already done in app/layout.tsx):
 *        <ToastProvider>{children}</ToastProvider>
 *   2. Anywhere inside, call the hook:
 *        const { showToast } = useToast();
 *        showToast("Saved successfully", "success");
 *        showToast("Something went wrong", "error");
 *
 * NOTE: This is wired to nothing yet — it stays invisible until showToast()
 * is called, so it is safe to leave mounted.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning" | "info";

type ToastTone = {
  border: string;
  bg: string;
  title: string;
  sub: string;
  icon: string;
  label: string;
};

const TONES: Record<ToastType, ToastTone> = {
  success: { border: "#a9d7cb", bg: "#f1fffc", title: "#017155", sub: "#92c6b9", icon: "/success-icon.png", label: "Success" },
  error:   { border: "#ffcccc", bg: "#fff1f1", title: "#F03D3D", sub: "#f57e7e", icon: "/error-icon.png",   label: "Error" },
  warning: { border: "#fee0aa", bg: "#fffaf1", title: "#DA8700", sub: "#e8b765", icon: "/warning-icon.png", label: "Warning" },
  info:    { border: "#a9d3ff", bg: "#f1f8ff", title: "#006FE6", sub: "#5ba2ee", icon: "/info-icon.png",    label: "Information" },
};

const DEFAULT_DURATION_MS = 4000;
const EXIT_MS = 500;

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
};

type ToastContextValue = {
  /** Show a toast. `type` defaults to "success". Returns the toast id. */
  showToast: (message: string, type?: ToastType) => number;
  /** Dismiss a specific toast early (optional). */
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [topPx, setTopPx] = useState(16);
  const idRef = useRef(0);

  // Sit just below the page header (so it lands at the pills level on settings
  // pages, instead of overlapping a sticky header). Falls back to 16px when no
  // header is present.
  const recomputeTop = useCallback(() => {
    if (typeof document === "undefined") return;
    const header = document.querySelector("header");
    setTopPx(header ? Math.round(header.getBoundingClientRect().bottom + 8) : 16);
  }, []);

  useEffect(() => {
    setMounted(true);
    recomputeTop();
    window.addEventListener("resize", recomputeTop);
    return () => window.removeEventListener("resize", recomputeTop);
  }, [recomputeTop]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      recomputeTop();
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, message, type, leaving: false }]);
      window.setTimeout(() => dismissToast(id), DEFAULT_DURATION_MS);
      return id;
    },
    [dismissToast, recomputeTop],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed right-4 z-[500] flex flex-col items-end gap-2" style={{ top: topPx }}>
              {toasts.map((t) => (
                <ToastCard key={t.id} item={t} onClose={() => dismissToast(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const tone = TONES[item.type] ?? TONES.success;
  const [entered, setEntered] = useState(false);
  const iconRef = useRef<HTMLImageElement>(null);

  // Decode the icon before sliding in so it never flashes a wrong/blank icon.
  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (!cancelled) requestAnimationFrame(() => setEntered(true));
    };
    const img = iconRef.current;
    if (img && typeof img.decode === "function") {
      img.decode().then(reveal).catch(reveal);
    } else {
      reveal();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const hidden = !entered || item.leaving;

  return (
    <div
      className="pointer-events-auto transition-transform duration-500 ease-in-out"
      style={{ transform: hidden ? "translateX(calc(100% + 1.5rem))" : "translateX(0)" }}
    >
      <div
        className="flex min-h-[64px] w-[420px] max-w-[calc(100vw-2rem)] items-center justify-between gap-3 rounded-full border-[5px] py-[6px] pl-[8px] pr-[20px]"
        style={{ borderColor: tone.border, backgroundColor: tone.bg }}
        role={item.type === "error" ? "alert" : "status"}
        aria-live={item.type === "error" ? "assertive" : "polite"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={iconRef} src={tone.icon} alt={tone.label} className="h-[44px] w-[36px] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center text-[14px] leading-snug">
          <p className="whitespace-nowrap font-[500]" style={{ color: tone.title }}>
            {tone.label}
          </p>
          <p className="w-full break-words font-[400]" style={{ color: tone.sub }}>
            {item.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer text-gray-500 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-[14px] w-[14px]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
