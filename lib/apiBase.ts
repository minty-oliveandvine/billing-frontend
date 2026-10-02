/**
 * Base URL of the Payment Request API (minty-payment-request-api, module 2) - `PAYMENT_REQUEST_API_URL`,
 * read in `lib/env.ts` and inlined at build time, so it is resolved once per build, not per request.
 */
import { env } from "./env";

export const API_BASE = env.PAYMENT_REQUEST_API_URL;
