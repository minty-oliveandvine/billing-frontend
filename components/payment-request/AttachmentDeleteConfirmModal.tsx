"use client";

import { createPortal } from "react-dom";
import { useEffect, useId } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";

export type AttachmentDeleteConfirmModalProps = {
  open: boolean;
  count: number;
  pending?: boolean;
  onClose: () => void;
  /** Not used when `variant` is `minimumAttachment`. */
  onConfirm?: () => void;
  variant?: "attachments" | "bankSlip" | "minimumAttachment";
  fileName?: string;
};

const overlayClass =
  "fixed inset-0 z-[430] flex items-center justify-center overflow-x-hidden overscroll-x-none bg-black/45 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4";

const shellClass =
  "relative z-[1] w-full min-w-0 max-w-[400px] rounded-xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:rounded-2xl sm:p-6";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const cancelClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

const deleteClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity duration-200 ease-out hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

const okPrimaryClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

export function AttachmentDeleteConfirmModal({
  open,
  count,
  pending = false,
  onClose,
  onConfirm,
  variant = "attachments",
  fileName,
}: AttachmentDeleteConfirmModalProps) {
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

  if (variant === "minimumAttachment") {
    return createPortal(
      <div
        className={overlayClass}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
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
            At least one attachment required
          </h2>
          <p id={descId} className="mt-3 text-sm leading-relaxed text-primary/80">
            Any bill must have at least one supporting document. You may refresh the page to restore the last saved document.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={okPrimaryClass} onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const n = Math.max(0, Math.floor(count));
  const isBankSlip = variant === "bankSlip";
  const titleText =
    isBankSlip && n <= 1 ? "Delete bank slip?" : n > 1 ? "Delete attachments?" : "Delete attachment?";

  return createPortal(
    <div
      className={overlayClass}
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
          {titleText}
        </h2>
        <p id={descId} className="mt-3 text-sm leading-relaxed text-primary/80">
          {isBankSlip && n === 1 ? (
            <>
              Are you sure you want to delete this uploaded bank slip
              {fileName?.trim() ? (
                <>
                  {" "}
                  <span className="font-medium break-all">“{fileName.trim()}”</span>
                </>
              ) : null}
              ?
            </>
          ) : n > 1 ? (
            <>Are you sure you want to delete these {n} attachments?</>
          ) : (
            <>Are you sure you want to delete this attachment?</>
          )}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={cancelClass} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={deleteClass}
            onClick={() => onConfirm?.()}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

