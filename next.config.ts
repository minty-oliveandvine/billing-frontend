import type { NextConfig } from "next";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Copy the pdf.js runtime assets (worker, cMaps, standard fonts) out of the
 * installed pdfjs-dist package into /public/pdfjs so they are served
 * same-origin instead of from a third-party CDN. Runs here (rather than via a
 * package.json script) because next.config is evaluated by Node at the start of
 * both `next dev` and `next build`. The copied assets always match the
 * installed pdfjs-dist version, and /public/pdfjs is gitignored.
 */
function copyPdfjsAssets() {
  const root = process.cwd();
  const src = join(root, "node_modules", "pdfjs-dist");
  if (!existsSync(src)) return; // deps not installed yet — skip quietly
  const dest = join(root, "public", "pdfjs");
  const items: [string, string][] = [
    ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
    ["cmaps", "cmaps"],
    ["standard_fonts", "standard_fonts"],
  ];
  try {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const [from, to] of items) {
      cpSync(join(src, from), join(dest, to), { recursive: true });
    }
  } catch (err) {
    console.warn("[next.config] failed to copy pdf.js assets:", err);
  }
}

copyPdfjsAssets();

const nextConfig: NextConfig = {
  /** Slightly smaller responses; security-through-obscurity only. */
  poweredByHeader: false,
};

export default nextConfig;
