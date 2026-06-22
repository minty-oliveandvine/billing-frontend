"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchBill } from "@/lib/api";
import { billStatusToDisplayLabel, statusDisplayBadgeClass } from "@/lib/billStatusDisplay";

export type PaymentRequestDetailStatusBadgeProps = {
  refreshSignal?: number;
};

export function PaymentRequestDetailStatusBadge({ refreshSignal = 0 }: PaymentRequestDetailStatusBadgeProps) {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchBill(id)
      .then((bill) => {
        if (!cancelled) setLabel(billStatusToDisplayLabel(bill.status));
      })
      .catch(() => {
        // Keep stale label on error so the badge does not disappear
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshSignal]);

  if (!label) return null;

  return <span className={`${statusDisplayBadgeClass(label)} sm:min-w-[11rem]`}>{label}</span>;
}
