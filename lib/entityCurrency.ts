"use client";

// The entity's selected currency (entities.currency_id -> currency_info),
// rendered across the billing UI as the ISO code — mirroring the pettycash
// modules. Fetched once per page load and cached module-wide; a failed fetch
// clears the cache so a later call retries.

import { useEffect, useState } from "react";

import { fetchEntityCurrency } from "./api";
import { currencyLabelForCode } from "./currencyDisplay";

let cached: Promise<string> | null = null;

/** Resolve the entity's ISO currency code ("" when unset/unavailable). */
export function getEntityCurrencyCode(): Promise<string> {
  if (!cached) {
    cached = fetchEntityCurrency()
      .then((data) => currencyLabelForCode(data.currency_code || ""))
      .catch(() => {
        cached = null;
        return "";
      });
  }
  return cached;
}

/** ISO code of the entity's selected currency; "" until loaded (callers fall
 * back to their per-record currency code while empty). */
export function useEntityCurrency(): string {
  const [code, setCode] = useState("");
  useEffect(() => {
    let alive = true;
    getEntityCurrencyCode().then((c) => {
      if (alive && c) setCode(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return code;
}
