"use client";

import { createPortal } from "react-dom";
import { useId, type ReactNode } from "react";
import { PdfJsCanvasPreview } from "@/components/PdfJsCanvasPreview";

export function FullFilePreviewLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open full file in new tab"
      className={className?.trim() ? `block cursor-pointer ${className}` : "block cursor-pointer"}
    >
      {children}
    </a>
  );
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.trim().split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "heic" || ext === "heif" || ext === "webp" || ext === "gif";
}

export function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.trim().toLowerCase().endsWith(".pdf");
}

export type FileIconInfo = { icon: string; iconClass: string };

export function FileAttachmentPreviewLayer({
  file,
  objectUrl,
  onClose,
  getUploadedFileIconInfo,
}: {
  file: File;
  objectUrl: string;
  onClose: () => void;
  getUploadedFileIconInfo: (filename: string) => FileIconInfo;
}) {
  const previewId = useId();
  const previewSubtitleId = useId();
  const showImage = isImageFile(file);
  const showPdf = isPdfFile(file);
  const { icon, iconClass } = getUploadedFileIconInfo(file.name);
  const sizeLabel = formatFileSize(file.size);

  return createPortal(
    <div
      className="fixed inset-0 z-[310] flex items-center justify-center overflow-x-hidden overscroll-x-none p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4"
      role="presentation"
    >
      <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={previewId}
        aria-describedby={previewSubtitleId}
        className="relative z-[1] flex max-h-[min(92dvh,720px)] w-full max-w-[min(100%,720px)] flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-1 gap-3 pr-2">
            <span
              className={`material-symbols-outlined mt-0.5 shrink-0 text-[28px] leading-none sm:mt-1 sm:text-[32px] ${iconClass}`}
              aria-hidden
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p id={previewId} className="truncate text-sm font-medium text-black sm:text-base">
                {file.name}
              </p>
              <p
                id={previewSubtitleId}
                className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary/55 sm:text-xs"
              >
                Document preview<span className="text-primary/35"> • </span>
                {sizeLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            aria-label="Close preview"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              close
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-black/5 p-2 sm:p-4">
          {showImage ? (
            <img
              src={objectUrl}
              alt={`Preview: ${file.name}`}
              className="mx-auto max-h-[min(75dvh,640px)] w-auto max-w-full object-contain"
            />
          ) : null}
          {showPdf && !showImage ? (
            <PdfJsCanvasPreview src={objectUrl} title={file.name} className="w-full" maxPageWidthCssPx={640} />
          ) : null}
          {!showImage && !showPdf ? (
            <p className="py-8 text-center text-sm text-primary/70">Preview is not available for this file type.</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
