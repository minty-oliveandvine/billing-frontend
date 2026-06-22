"use client";

import { useEffect, useRef, useState } from "react";
import { getAuth, isTokenExpired, isTokenExpiringSoon, redirectToLogin, refreshToken } from "@/lib/auth";

let workerSrcConfigured = false;

function configureWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (workerSrcConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  workerSrcConfigured = true;
}

const DEFAULT_MAX_PAGES = 50;

const API_BASE =
  process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000";

export type PdfJsCanvasPreviewProps = {
  src: string;
  /**
   * Optional Django proxy path for fetching the PDF with auth headers instead
   * of using the raw storage URL directly. When provided the component fetches
   * bytes server-to-client (authenticated) and renders via pdf.js canvas,
   * avoiding cross-origin iframe restrictions in Edge and other browsers.
   *
   * Example: "/api/v1/bills/{billId}/attachments/{attachmentId}/preview/"
   */
  previewApiPath?: string;
  title?: string;
  className?: string;
  maxPageWidthCssPx?: number;
  maxPages?: number;
};

/**
 * Returns true when `src` is a local URL (blob: or data:) that can be safely
 * fetched by pdf.js without hitting CORS restrictions.
 */
function isLocalSrc(src: string): boolean {
  return src.startsWith("blob:") || src.startsWith("data:");
}

/**
 * Fetch a PDF from a Django proxy endpoint with JWT auth headers.
 * Returns a blob: URL on success, or null on failure.
 */
async function fetchProxyBlob(apiPath: string): Promise<string | null> {
  try {
    if (isTokenExpiringSoon(5 * 60)) {
      const refreshed = await refreshToken();
      if (!refreshed && isTokenExpired()) {
        redirectToLogin();
        return null;
      }
    }
    const auth = getAuth();
    if (!auth?.token) {
      redirectToLogin();
      return null;
    }
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${auth.token}`);
    headers.set("X-Entity-Id", auth.entityId);
    const url = `${API_BASE.replace(/\/$/, "")}${apiPath}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    // Ensure the blob has the correct MIME type so pdf.js accepts it.
    const typed =
      blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
    return URL.createObjectURL(typed);
  } catch {
    return null;
  }
}

export function PdfJsCanvasPreview({
  src,
  previewApiPath,
  title = "PDF preview",
  className = "",
  maxPageWidthCssPx = 720,
  maxPages = DEFAULT_MAX_PAGES,
}: PdfJsCanvasPreviewProps) {
  // When a Django proxy path is supplied, fetch the PDF bytes with auth and
  // render via pdf.js canvas — this avoids cross-origin iframe blocks entirely.
  if (previewApiPath) {
    return (
      <PdfJsProxyFetcher
        apiPath={previewApiPath}
        title={title}
        className={className}
        maxPageWidthCssPx={maxPageWidthCssPx}
        maxPages={maxPages}
      />
    );
  }

  // blob: / data: URLs are safe for pdf.js canvas rendering.
  if (isLocalSrc(src)) {
    return (
      <PdfJsCanvasRenderer
        src={src}
        title={title}
        className={className}
        maxPageWidthCssPx={maxPageWidthCssPx}
        maxPages={maxPages}
      />
    );
  }

  // Fallback for any remaining remote URL: render via pdf.js canvas directly.
  // (In practice this path should no longer be hit for B2 URLs — callers should
  // pass previewApiPath instead to avoid CORS and Edge iframe restrictions.)
  return (
    <PdfJsCanvasRenderer
      src={src}
      title={title}
      className={className}
      maxPageWidthCssPx={maxPageWidthCssPx}
      maxPages={maxPages}
    />
  );
}

/**
 * Fetches the PDF bytes from a Django proxy path (with JWT auth), creates a
 * blob URL, then hands it off to PdfJsCanvasRenderer.
 */
function PdfJsProxyFetcher({
  apiPath,
  title,
  className,
  maxPageWidthCssPx,
  maxPages,
}: {
  apiPath: string;
  title: string;
  className: string;
  maxPageWidthCssPx: number;
  maxPages: number;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setBlobUrl(null);
    setFetchError(false);

    void (async () => {
      const url = await fetchProxyBlob(apiPath);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (!url) {
        setFetchError(true);
        return;
      }
      createdUrl = url;
      setBlobUrl(url);
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
        createdUrl = null;
      }
    };
  }, [apiPath]);

  if (fetchError) {
    return (
      <div className={`${className} flex flex-col items-center gap-2 py-8 text-center text-sm text-primary/70`}>
        <p>Could not display this PDF in preview.</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className={`${className} flex min-h-[200px] items-center justify-center py-8 text-sm text-primary/60`}>
        <span className="inline-flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-secondary text-[22px]" aria-hidden>
            progress_activity
          </span>
          Loading PDF…
        </span>
      </div>
    );
  }

  return (
    <PdfJsCanvasRenderer
      src={blobUrl}
      title={title}
      className={className}
      maxPageWidthCssPx={maxPageWidthCssPx}
      maxPages={maxPages}
    />
  );
}

function PdfJsCanvasRenderer({
  src,
  title,
  className,
  maxPageWidthCssPx,
  maxPages,
}: Required<Omit<PdfJsCanvasPreviewProps, "previewApiPath">>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | undefined;
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    setStatus("loading");

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        configureWorker(pdfjs);
        const loadingTask = pdfjs.getDocument({ url: src, withCredentials: false });
        pdfDoc = await loadingTask.promise;
        const pageLimit = Math.min(pdfDoc.numPages, Math.max(1, maxPages));
        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1, 2);

        for (let p = 1; p <= pageLimit; p++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(maxPageWidthCssPx / base.width, 2.5);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title} — page ${p} of ${pdfDoc.numPages}`);
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className =
            "mx-auto block rounded border border-gray-200 bg-white shadow-sm";
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          ctx.scale(dpr, dpr);
          const renderTask = page.render({ canvasContext: ctx, viewport });
          await renderTask.promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }

        if (!cancelled && pageLimit < pdfDoc.numPages) {
          const note = document.createElement("p");
          note.className = "mt-2 text-center text-xs text-primary/55";
          note.textContent = `Showing first ${pageLimit} of ${pdfDoc.numPages} pages.`;
          host.appendChild(note);
        }

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        if (pdfDoc) {
          await pdfDoc.destroy().catch(() => {});
        }
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [src, title, maxPageWidthCssPx, maxPages]);

  return (
    <div className={className}>
      {status === "loading" ? (
        <div className="flex min-h-[200px] items-center justify-center py-8 text-sm text-primary/60">
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-secondary text-[22px]" aria-hidden>
              progress_activity
            </span>
            Loading PDF…
          </span>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-primary/70">
          <p>Could not display this PDF in preview.</p>
          <a href={src} target="_blank" rel="noopener noreferrer" className="font-semibold text-secondary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            Open PDF in new tab
          </a>
        </div>
      ) : null}
      <div ref={hostRef} className={status === "ready" ? "flex w-full flex-col items-stretch gap-3" : "hidden"} />
    </div>
  );
}
