/**
 * Base URL of the billing (module 2) backend. Read from the environment so it
 * can be pointed at local / dev / prod backends without code changes; falls
 * back to the local dev server. `NEXT_PUBLIC_*` is inlined at build time, so
 * this is resolved once per build, not per request.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000";
