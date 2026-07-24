/** Currency label for money display: the ISO 4217 code itself (e.g. "HKD").
 * All billing UI renders amounts with the ISO code, not a symbol. */
export function currencyLabelForCode(code: string): string {
  return (code || "").trim().toUpperCase();
}
