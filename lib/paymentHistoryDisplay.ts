import type { PaymentItem } from "@/lib/api";

export function shouldShowPaymentInHistory(p: Pick<PaymentItem, "amount">): boolean {
  const n = parseFloat(p.amount || "0");
  return Number.isFinite(n) && n > 0;
}
