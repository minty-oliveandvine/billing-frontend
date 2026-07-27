"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, type ReactNode } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";

/**
 * Shared scaffold for the payment-request confirm dialogs (delete / void /
 * warning). Owns the portal, backdrop overlay, scroll-lock, Escape-to-close,
 * and the accessible alertdialog wrapper + button row. Each concrete modal
 * stays a thin wrapper that supplies its own title, body, labels, z-index and
 * confirm styling — so user-facing strings and public props are unchanged.
 */

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const shellClass =
  "relative z-[1] w-full min-w-0 max-w-[400px] rounded-xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:rounded-2xl sm:p-6";

const cancelClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

/** Red destructive confirm button (delete / void). */
const dangerClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity duration-200 ease-out hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

/** Secondary-color primary button (e.g. an acknowledgement "OK"). */
const primaryClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

function overlayClassFor(zIndex: number): string {
  return `fixed inset-0 z-[${zIndex}] flex items-center justify-center overflow-x-hidden overscroll-x-none bg-black/45 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4`;
}

export type ConfirmDialogProps = {
  open: boolean;
  /** Stacking context; each modal keeps its historical z-index. */
  zIndex: number;
  title: ReactNode;
  /** Dialog body, rendered inside the described-by paragraph. */
  children: ReactNode;
  pending?: boolean;
  onClose: () => void;
  /**
   * Confirm handler. Omit together with `hideConfirm` for an acknowledge-only
   * dialog (single OK button that calls `onClose`).
   */
  onConfirm?: () => void;
  confirmLabel?: ReactNode;
  confirmVariant?: "danger" | "primary";
  /** When true, render only a single primary button (no Cancel / Confirm pair). */
  acknowledgeOnly?: boolean;
  /** Label of the single button in acknowledge-only mode. */
  acknowledgeLabel?: ReactNode;
};

export function ConfirmDialog({
  open,
  zIndex,
  title,
  children,
  pending = false,
  onClose,
  onConfirm,
  confirmLabel,
  confirmVariant = "danger",
  acknowledgeOnly = false,
  acknowledgeLabel = "OK",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pending]);

  if (!open || typeof document === "undefined") return null;

  const confirmClass = confirmVariant === "primary" ? primaryClass : dangerClass;

  return createPortal(
    <div
      className={overlayClassFor(zIndex)}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={shellClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-primary sm:text-xl">
          {title}
        </h2>
        <p id={descId} className="mt-3 text-sm leading-relaxed text-primary/80">
          {children}
        </p>
        {acknowledgeOnly ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={primaryClass} onClick={onClose}>
              {acknowledgeLabel}
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" className={cancelClass} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className={confirmClass}
              onClick={() => onConfirm?.()}
              disabled={pending}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
