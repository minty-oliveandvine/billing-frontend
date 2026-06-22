/** Short symbol for common ISO 4217 codes (pill / money display). */
export function currencyLabelForCode(code: string): string {
  const m: Record<string, string> = {
    HKD: "HK$",
    USD: "US$",
    EUR: "€",
    GBP: "£",
    CNY: "CN¥",
  };
  return m[code.toUpperCase()] ?? code;
}
