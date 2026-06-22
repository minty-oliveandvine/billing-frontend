"use client";

import { createPortal } from "react-dom";
import { useEffect, useId } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";

export type BulkDeleteConfirmModalProps = {
  open: boolean;
  selectedCount: number;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const overlayClass =
  "fixed inset-0 z-[300] flex items-center justify-center overflow-x-hidden overscroll-x-none bg-black/45 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4";

const shellClass =
  "relative z-[1] w-full min-w-0 max-w-[400px] rounded-xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:rounded-2xl sm:p-6";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const cancelClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

const deleteClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity duration-200 ease-out hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

export function BulkDeleteConfirmModal({
  open,
  selectedCount,
  pending = false,
  onClose,
  onConfirm,
}: BulkDeleteConfirmModalProps) {
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

  return createPortal(
    <div className={overlayClass} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={shellClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-primary sm:text-xl">
          Void selected bills?
        </h2>
        <p id={descId} className="mt-3 text-sm leading-relaxed text-primary/80">
          Are you sure you want to void {selectedCount} selected bill{selectedCount === 1 ? "" : "s"}? They will be marked as voided and can no longer be edited.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={cancelClass} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={deleteClass} onClick={onConfirm} disabled={pending}>
            {pending ? "Voiding…" : "Void Bills"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
