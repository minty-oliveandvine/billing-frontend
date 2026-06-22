/**
 * Resolves the Minty (module 1) origin URL to use at runtime, based on the
 * deployment environment.  Lives in its own file (with no imports) so any
 * module — including ``lib/auth.ts`` — can consume it without creating
 * circular imports.
 *
 * Resolution order (first hit wins):
 *  1. ``NEXT_PUBLIC_MODULE1_URL`` — explicit override.  Always wins so a
 *     local dev or one-off preview can pin the URL without touching code.
 *  2. ``NEXT_PUBLIC_APP_ENV`` — deployment-environment switch:
 *       - "development" / "dev"        → ``NEXT_PUBLIC_MODULE1_URL_DEV``
 *                                        (default: development-olive-and-vine-minty.onrender.com)
 *       - "prestaging" / "pre-staging" → ``NEXT_PUBLIC_MODULE1_URL_PRESTAGING``
 *                                        (default: pre-staging-olive-and-vine-minty.onrender.com)
 *       - "staging"                    → ``NEXT_PUBLIC_MODULE1_URL_STAGING``
 *       - "production" / "prod"        → ``NEXT_PUBLIC_MODULE1_URL_PROD``
 *  3. Localhost fallback for unconfigured local builds.
 *
 * Returns the resolved URL string.
 */
const DEFAULT_DEV_URL = "https://development-olive-and-vine-minty.onrender.com";
const DEFAULT_PRESTAGING_URL =
  "https://pre-staging-olive-and-vine-minty.onrender.com";
const DEFAULT_STAGING_URL =
  "https://staging-olive-and-vine-minty-26bm.onrender.com";
const DEFAULT_PROD_URL = "https://minty.oliveandvinehk.com";
const LOCALHOST_URL = "http://localhost:5001";

export function resolveMintyModuleUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_MODULE1_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  switch (appEnv) {
    case "development":
    case "dev":
      return (
        process.env.NEXT_PUBLIC_MODULE1_URL_DEV?.trim() || DEFAULT_DEV_URL
      );
    case "prestaging":
    case "pre-staging":
      return (
        process.env.NEXT_PUBLIC_MODULE1_URL_PRESTAGING?.trim() ||
        DEFAULT_PRESTAGING_URL
      );
    case "staging":
      return (
        process.env.NEXT_PUBLIC_MODULE1_URL_STAGING?.trim() || DEFAULT_STAGING_URL
      );
    case "production":
    case "prod":
      return (
        process.env.NEXT_PUBLIC_MODULE1_URL_PROD?.trim() || DEFAULT_PROD_URL
      );
    default:
      return LOCALHOST_URL;
  }
}
