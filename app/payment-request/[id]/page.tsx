import type { Metadata } from "next";
import { PaymentRequestDetailPageClient } from "./PaymentRequestDetailPageClient";

export const metadata: Metadata = {
  title: "Payment Request Details",
  description: "Payment request details",
};

export default function PaymentRequestDetailPage() {
  return <PaymentRequestDetailPageClient />;
}
