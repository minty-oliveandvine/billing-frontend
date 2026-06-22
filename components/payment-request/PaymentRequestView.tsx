"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BankSlipDetailsModal } from "./BankSlipDetailsModal";
import { PaymentRequestEasyView } from "./PaymentRequestEasyView";
import {
  getBankSlipDetailsForRow,
  PaymentRequestTable,
  type PaymentRequestRow,
  type PaymentRequestTableHandle,
} from "./PaymentRequestTable";
import { PaymentRequestToolbar, type PaymentRequestStatusFilter } from "./PaymentRequestToolbar";
import { BulkDeleteConfirmModal } from "./BulkDeleteConfirmModal";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { RowDeleteConfirmModal } from "./RowDeleteConfirmModal";
import type { EasyViewDraftDetailActions } from "./EasyViewDraftDetailedInformation";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import {
  deleteBill,
  fetchBill,
  fetchBills,
  publishBill,
  returnBill,
  type BillAttachment,
  type BillListItem,
  type BillDetail
} from "@/lib/api";
import type { InvoiceAttachmentPreviewItem } from "./InvoiceAttachmentPreview";
import { currencyLabelForCode } from "@/lib/currencyDisplay";
import { fetchBillBankSlipEnrichment } from "@/lib/bankSlipEnrichment";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { getAuth } from "@/lib/auth";
import { useUserRole } from "@/lib/useUserRole";

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const head = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const f = formatIsoDateForDisplay(head);
    if (f) return f;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatIsoDateForDisplay(`${y}-${m}-${day}`) || dateStr;
}

function formatAmount(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mapBillToRow(bill: BillListItem): PaymentRequestRow {
  const status = billStatusToDisplayLabel(bill.status);
  const iso = (bill.currency_code && bill.currency_code.trim()) || "HKD";
  const symbol = currencyLabelForCode(iso);
  const statusNorm = (bill.status ?? "").trim().toLowerCase().replace(/-/g, "_");
  const xeroActive =
    (bill.published ?? "").trim() === "published" ||
    statusNorm === "authorised" ||
    statusNorm === "authorized";

  return {
    id: bill.id,
    contactTitle: bill.contact || "—",
    contactCaption: bill.description,
    currencyCode: iso,
    invoiceDate: bill.invoice_date ? formatDate(bill.invoice_date) : "",
    status,
    submittedDate: formatDate(bill.created_at),
    unpaidAmount:
      parseFloat(bill.amount_due) !== 0
        ? `${symbol} ${formatAmount(bill.amount_due)}`
        : `${symbol} 0.00`,
    invoiceTotal: bill.amount ? formatAmount(bill.amount) : "",
    payment: "",
    paidDate: bill.paid_at ? formatDate(bill.paid_at) : "",
    bankslip: "",
    xeroActive,
  };
}

const STATUS_LABEL_TO_API: Record<string, string> = {
  "Draft": "draft",
  "Payment Requested": "submitted",
  "Paid": "paid",
  "Partially Paid": "partially_paid",
  "Voided": "voided",
  "Returned": "returned",
};

const DATE_TYPE_TO_FIELD: Record<string, string> = {
  "Invoice Date": "invoice_date",
  "Submitted Date": "created_at",
};

/** Same mapping as `PaymentRequestDetailBody.mapServerAttachmentsToPreviewItems`. */
function mapBillAttachmentsToPreviewItems(
  billId: string,
  serverAttachments: BillAttachment[],
): InvoiceAttachmentPreviewItem[] {
  return serverAttachments
    .filter((ba) => ba.attachment?.download_url)
    .map((ba) => ({
      url: ba.attachment.download_url,
      name: ba.attachment.original_name,
      mime: ba.attachment.mime_type || "application/octet-stream",
      previewApiPath:
        (ba.attachment.mime_type || "").toLowerCase() === "application/pdf"
          ? `/api/v1/bills/${billId}/attachments/${ba.id}/preview/`
          : undefined,
      billAttachmentId: ba.id,
    }));
}

export type PaymentRequestViewProps = {
  easyView: boolean;
};

export function PaymentRequestView({ easyView }: PaymentRequestViewProps) {
  const router = useRouter();
  const { isElevated, isViewOnly, isReadOnly } = useUserRole();
  const [currentEntityId, setCurrentEntityId] = useState<string>("");

  useEffect(() => {
    const a = getAuth();
    setCurrentEntityId(a?.entityId ?? "");
  }, []);

  // True when a system superuser is viewing an entity they are not a member of.
  // In this case we show a prominent banner and all write controls are already
  // hidden/disabled by isViewOnly.
  const showReadOnlyBanner = isViewOnly && isReadOnly(currentEntityId);
  // Empty array = "All". One entry = single-status filter (kept server-side).
  // 2+ entries = stacked filter (server returns everything, client filters by union).
  const [statusFilters, setStatusFilters] = useState<PaymentRequestStatusFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dateType, setDateType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [xeroStatus, setXeroStatus] = useState("");
  const [rawBills, setRawBills] = useState<BillListItem[]>([]);
  const [bills, setBills] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<{ billId: string; readOnly: boolean } | null>(null);
  const [easyViewPayBillId, setEasyViewPayBillId] = useState<string | null>(null);
  const [easyViewPayReadOnly, setEasyViewPayReadOnly] = useState(false);
  const [easyViewDraftBillId, setEasyViewDraftBillId] = useState<string | null>(null);
  const [easyViewDraftDeleteOpen, setEasyViewDraftDeleteOpen] = useState(false);
  const [easyViewDraftDeletePending, setEasyViewDraftDeletePending] = useState(false);
  const [easyViewSelectedBillId, setEasyViewSelectedBillId] = useState<string | null>(null);
  const [easyViewInvoiceAttachments, setEasyViewInvoiceAttachments] = useState<InvoiceAttachmentPreviewItem[]>([]);
  const [easyViewInvoiceLoading, setEasyViewInvoiceLoading] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const tableRef = useRef<PaymentRequestTableHandle>(null);
  const [easyViewBankSlipRowId, setEasyViewBankSlipRowId] = useState<string | null>(null);
  const bulkActionsEnabled = selectedBillIds.length >= 2;
  const [easyViewPayBill, setEasyViewPayBill] = useState<BillDetail | null>(null);

  /** Xero publish-state filter (client-side; `xeroActive` is derived in `mapBillToRow`). */
  const visibleBills = useMemo(() => {
    // Voided bills are hidden from every view unless the user explicitly selects the
    // "Voided" status filter. A shop manager can accidentally void a bill when adding
    // it, and surfacing those mistakes in the default list is confusing/irritating —
    // they stay reachable only through the dedicated Voided filter.
    const showVoided = statusFilters.includes("Voided");
    let result = showVoided ? bills : bills.filter((r) => r.status !== "Voided");
    if (xeroStatus === "published") result = result.filter((r) => r.xeroActive === true);
    else if (xeroStatus === "not_published") result = result.filter((r) => r.xeroActive !== true);
    return result;
  }, [bills, xeroStatus, statusFilters]);

  const easyViewBankSlipSourceRow = useMemo(() => {
    if (!easyViewBankSlipRowId) return undefined;
    return bills.find((x) => x.id === easyViewBankSlipRowId);
  }, [easyViewBankSlipRowId, bills]);

  const easyViewBankSlipPayload = useMemo(() => {
    if (!easyViewBankSlipSourceRow) return null;
    return getBankSlipDetailsForRow(easyViewBankSlipSourceRow);
  }, [easyViewBankSlipSourceRow]);

  const easyViewBankSlipReadOnly =
    easyViewBankSlipSourceRow != null &&
    (easyViewBankSlipSourceRow.status === "Voided" || easyViewBankSlipSourceRow.status === "Draft");

  const selectionContainsPaid = useMemo(() => {
    const selectedSet = new Set(selectedBillIds);
    return bills.some(
      (row) =>
        selectedSet.has(row.id) && (row.status === "Paid" || row.status === "Partially Paid"),
    );
  }, [selectedBillIds, bills]);

  const onTableSelectionChange = useCallback((ids: string[]) => {
    setSelectedBillIds(ids);
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setDebouncedSearch("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Only push status to the server when exactly one is selected. For 0 or 2+
      // we omit the param and let the client-side filter narrow the rows.
      const apiStatus =
        statusFilters.length === 1 ? STATUS_LABEL_TO_API[statusFilters[0]!] : undefined;
      const dateField = DATE_TYPE_TO_FIELD[dateType];
      const data = await fetchBills({
        page_size: 100,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(apiStatus ? { status: apiStatus } : {}),
        ...(minAmount !== "" ? { amount_min: parseFloat(minAmount) } : {}),
        ...(maxAmount !== "" ? { amount_max: parseFloat(maxAmount) } : {}),
        ...(dateField ? { date_field: dateField } : {}),
        ...(startDate ? { date_from: startDate } : {}),
        ...(endDate ? { date_to: endDate } : {}),
      });
      setRawBills(data);
      const mapped = data.map(mapBillToRow);
      setBills(mapped);
      const BATCH = 5;
      const enriched: PaymentRequestRow[] = [];
      for (let i = 0; i < mapped.length; i += BATCH) {
        const batch = mapped.slice(i, i + BATCH);
        const chunk = await Promise.all(
          batch.map(async (r) => {
            const { bankslipFileCount, bankSlipDetails } = await fetchBillBankSlipEnrichment(r.id, {
              contactTitle: r.contactTitle,
              submittedDate: r.submittedDate,
              invoiceDate: r.invoiceDate,
              paidDate: r.paidDate,
              unpaidAmount: r.unpaidAmount,
              currencyCode: r.currencyCode,
            });
            return {
              ...r,
              bankslipFileCount,
              ...(bankSlipDetails ? { bankSlipDetails } : {}),
            };
          }),
        );
        enriched.push(...chunk);
      }
      setBills(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilters, minAmount, maxAmount, dateType, startDate, endDate]);

  const easyViewPaySource = useMemo(() => {
    if (!easyViewPayBillId) return null;
    return rawBills.find((b) => b.id === easyViewPayBillId) ?? null;
  }, [easyViewPayBillId, rawBills]);

  const easyViewPayPanel: ReactNode =
    easyViewPayBillId && easyViewPaySource ? (
      <RecordPaymentModal
        key={easyViewPayBillId}
        presentation="easyInline"
        open
        onClose={() => {
          setEasyViewPayBillId(null);
          setEasyViewPayReadOnly(false);
          setEasyViewSelectedBillId(null);
        }}
        billId={easyViewPayBillId}
        billStatus={easyViewPaySource.status}
        contactTitle={easyViewPaySource.contact?.trim() ?? ""}
        readOnly={isViewOnly || easyViewPayReadOnly}
        invoiceAmount={parseFloat(easyViewPaySource.amount ?? "0") || 0}
        currencyCode={easyViewPaySource.currency_code?.trim() || "HKD"}
        description={easyViewPayBill?.description ?? ""}
        onPaymentSaved={loadBills}
      />
    ) : null;

  useEffect(() => {
    if (!easyViewPayBillId) return;
    const filtered =
      statusFilters.length === 0 ? bills : bills.filter((r) => statusFilters.some((s) => s === r.status));
    if (!filtered.some((r) => r.id === easyViewPayBillId)) {
      setEasyViewPayBillId(null);
      setEasyViewPayReadOnly(false);
    }
  }, [statusFilters, bills, easyViewPayBillId]);

  useEffect(() => {
    if (!easyViewDraftBillId) return;
    const filtered =
      statusFilters.length === 0 ? bills : bills.filter((r) => statusFilters.some((s) => s === r.status));
    if (!filtered.some((r) => r.id === easyViewDraftBillId)) {
      setEasyViewDraftBillId(null);
    }
  }, [statusFilters, bills, easyViewDraftBillId]);

  useEffect(() => {
    if (!easyViewDraftBillId) setEasyViewDraftDeleteOpen(false);
  }, [easyViewDraftBillId]);
 
  useEffect(() => {
    if (!easyViewPayBillId) {
      setEasyViewPayBill(null);
      return;
    }

    const fetchBillDetail = async () => {
    try {
      const bill = await fetchBill(easyViewPayBillId);
      setEasyViewPayBill(bill);
    } catch (e) {
      console.error("Failed to fetch bill for easy view modal:", e);
    }
  };
  
  fetchBillDetail();
}, [easyViewPayBillId]);


  const easyViewDraftDetailActions = useMemo<EasyViewDraftDetailActions>(
    () => ({
      onRequestDelete: () => setEasyViewDraftDeleteOpen(true),
      deleteDisabled: loading || isViewOnly || !isElevated || easyViewDraftDeletePending,
    }),
    [easyViewDraftDeletePending, loading, isViewOnly, isElevated],
  );

  useEffect(() => {
    if (!easyViewSelectedBillId) {
      setEasyViewInvoiceAttachments([]);
      setEasyViewInvoiceLoading(false);
      return;
    }
    let cancelled = false;
    setEasyViewInvoiceLoading(true);
    fetchBill(easyViewSelectedBillId)
      .then((detail) => {
        if (cancelled) return;
        setEasyViewInvoiceAttachments(mapBillAttachmentsToPreviewItems(detail.id, detail.attachments ?? []));
      })
      .catch(() => {
        if (!cancelled) setEasyViewInvoiceAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setEasyViewInvoiceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [easyViewSelectedBillId]);

  useEffect(() => {
    if (!easyViewSelectedBillId) return;
    const filtered =
      statusFilters.length === 0 ? bills : bills.filter((r) => statusFilters.some((s) => s === r.status));
    if (!filtered.some((r) => r.id === easyViewSelectedBillId)) {
      setEasyViewSelectedBillId(null);
    }
  }, [statusFilters, bills, easyViewSelectedBillId]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  useEffect(() => {
    if (bulkDeleteModalOpen && selectedBillIds.length < 2 && !bulkDeletePending) {
      setBulkDeleteModalOpen(false);
    }
  }, [bulkDeleteModalOpen, bulkDeletePending, selectedBillIds.length]);

  const openBulkDeleteModal = useCallback(() => {
    if (selectedBillIds.length < 2) return;
    setBulkDeleteModalOpen(true);
  }, [selectedBillIds.length]);

  const executeBulkDelete = useCallback(async () => {
    if (selectedBillIds.length < 2) return;
    setError(null);
    setBulkDeletePending(true);
    try {
      await Promise.all(selectedBillIds.map((id) => deleteBill(id)));
      await loadBills();
      tableRef.current?.clearSelection();
      setBulkDeleteModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bills");
    } finally {
      setBulkDeletePending(false);
    }
  }, [selectedBillIds, loadBills]);

  const runBulkPublishSelected = useCallback(async () => {
    if (selectedBillIds.length < 2) return;
    setError(null);
    try {
      await Promise.all(selectedBillIds.map((id) => publishBill(id)));
      await loadBills();
      tableRef.current?.clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish bills");
    }
  }, [selectedBillIds, loadBills]);

  return (
    <>
      <PaymentRequestToolbar
        activeStatuses={statusFilters}
        onActiveStatusesChange={setStatusFilters}
        onBillCreated={loadBills}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        bulkActionsEnabled={bulkActionsEnabled}
        bulkSelectedCount={selectedBillIds.length}
        onBulkDeleteSelected={openBulkDeleteModal}
        onBulkPublishSelected={runBulkPublishSelected}
        appliedMinAmount={minAmount}
        appliedMaxAmount={maxAmount}
        appliedDateType={dateType}
        appliedStartDate={startDate}
        appliedEndDate={endDate}
        appliedXeroStatus={xeroStatus}
        onApplyFilters={(f) => {
          setMinAmount(f.minAmount ?? "");
          setMaxAmount(f.maxAmount ?? "");
          setDateType(f.dateType ?? "");
          setStartDate(f.startDate ?? "");
          setEndDate(f.endDate ?? "");
          setXeroStatus(f.xeroStatus ?? "");
        }}
        selectionContainsPaid={selectionContainsPaid}
        canVoidPaid={isElevated}
        canPublish={isElevated}
      />
      {showReadOnlyBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto flex w-full max-w-[1920px] items-center gap-2 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-6"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] leading-none text-amber-600" aria-hidden>
            visibility
          </span>
          <span>Read-only access — you are not a member of this entity.</span>
        </div>
      ) : null}
      <main
        className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1920px] flex-1 flex-col overflow-x-hidden pt-2 sm:pt-3"
        data-easy-view={easyView ? "true" : undefined}
      >
        {error ? (
          <div className="px-4 py-8 text-center sm:px-6">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={loadBills} className="mt-2 text-sm font-medium text-secondary hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className={easyView ? "hidden min-h-0 flex-1 flex-col lg:flex" : "hidden"}>
              <PaymentRequestEasyView
                rows={visibleBills}
                loading={loading}
                activeStatuses={statusFilters}
                payPanelBillId={easyViewPayBillId}
                payPanel={easyViewPayPanel}
                selectedBillId={easyViewSelectedBillId}
                invoiceAttachments={easyViewInvoiceAttachments}
                invoiceAttachmentsLoading={easyViewInvoiceLoading}
                onRowClick={(rowId) => router.push(`/payment-request/${rowId}`)}
                onPaymentRequestedPay={(rowId) => {
                  const isClosing = easyViewPayBillId === rowId;
                  setEasyViewPayReadOnly(false);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewPayBillId(isClosing ? null : rowId);
                }}
                onPaidStatusOpen={(rowId) => {
                  const isSameRow = easyViewPayBillId === rowId;
                  const isClosing = isSameRow && easyViewPayReadOnly;
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setEasyViewPayReadOnly(!isClosing);
                  setEasyViewPayBillId(isClosing ? null : rowId);
                }}
                onOpenBankSlipUpload={(rowId) => setEasyViewBankSlipRowId(rowId)}
                draftDetailBillId={easyViewDraftBillId}
                onDraftBillOpen={(rowId) => {
                  const isClosing = easyViewDraftBillId === rowId;
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewPayBillId(null);
                  setEasyViewPayReadOnly(false);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setEasyViewDraftBillId(isClosing ? null : rowId);
                }}
                onOutsideCloseRequested={() => {
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewPayBillId(null);
                  setEasyViewPayReadOnly(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewSelectedBillId(null);
                }}
                draftDetailActions={easyViewDraftDetailActions}
                isElevated={isElevated}
                isViewOnly={isViewOnly}
                onDraftBillSaved={loadBills}
                easyViewBillMutatePending={easyViewDraftDeletePending}
                onRowDelete={(rowId) => {
                  setEasyViewDraftBillId(rowId);
                  setEasyViewDraftDeleteOpen(true);
                }}
                easyViewDraftDeleteOpen={easyViewDraftDeleteOpen}
              />
            </div>
            <div className={easyView ? "max-lg:block lg:hidden" : "block"}>
              <PaymentRequestTable
                ref={tableRef}
                rows={visibleBills}
                statusFilters={statusFilters}
                loading={loading}
                onSelectionChange={onTableSelectionChange}
                onRecordPayment={(rowId, readOnly) => setRecordPaymentTarget({ billId: rowId, readOnly: readOnly ?? false })}
                onRowClick={(rowId) => router.push(`/payment-request/${rowId}`)}
                onRowDelete={async (rowId) => {
                  try {
                    await deleteBill(rowId);
                    await loadBills();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to delete bill");
                    throw err;
                  }
                }}
                onRowPublish={async (rowId) => {
                  try {
                    await publishBill(rowId);
                    await loadBills();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to publish bill");
                  }
                }}
                onBankSlipUploaded={loadBills}
              />
            </div>
          </>
        )}
      </main>
      <BulkDeleteConfirmModal
        open={bulkDeleteModalOpen}
        selectedCount={selectedBillIds.length}
        pending={bulkDeletePending}
        onClose={() => {
          if (!bulkDeletePending) setBulkDeleteModalOpen(false);
        }}
        onConfirm={executeBulkDelete}
      />
      <RecordPaymentModal
        open={recordPaymentTarget != null}
        onClose={() => setRecordPaymentTarget(null)}
        billId={recordPaymentTarget?.billId ?? ""}
        billStatus={
          recordPaymentTarget ? rawBills.find((b) => b.id === recordPaymentTarget.billId)?.status : undefined
        }
        contactTitle={
          recordPaymentTarget
            ? rawBills.find((b) => b.id === recordPaymentTarget.billId)?.contact?.trim() ?? ""
            : ""
        }
        readOnly={isViewOnly || (recordPaymentTarget?.readOnly ?? false)}
        invoiceAmount={
          recordPaymentTarget
            ? parseFloat(rawBills.find((b) => b.id === recordPaymentTarget.billId)?.amount ?? "0")
            : 0
        }
        currencyCode={
          recordPaymentTarget
            ? rawBills.find((b) => b.id === recordPaymentTarget.billId)?.currency_code?.trim() || "HKD"
            : "HKD"
        }
        onPaymentSaved={loadBills}
      />
      <RowDeleteConfirmModal
        open={easyViewDraftDeleteOpen}
        contactTitle={bills.find((r) => r.id === easyViewDraftBillId)?.contactTitle ?? ""}
        isDraft={bills.find((r) => r.id === easyViewDraftBillId)?.status === "Draft"}
        pending={easyViewDraftDeletePending}
        onClose={() => {
          if (!easyViewDraftDeletePending) {
            setEasyViewDraftDeleteOpen(false);
            setEasyViewDraftBillId(null);
          }
        }}
        onConfirm={async () => {
          if (!easyViewDraftBillId) return;
          const row = bills.find((r) => r.id === easyViewDraftBillId);
          setError(null);
          setEasyViewDraftDeletePending(true);
          try {
            if (row?.status === "Draft") {
              await deleteBill(easyViewDraftBillId);
            } else if (row?.status === "Returned") {
              await returnBill(easyViewDraftBillId, "void");
            } else {
              await deleteBill(easyViewDraftBillId);
            }
            setEasyViewDraftDeleteOpen(false);
            setEasyViewDraftBillId(null);
            await loadBills();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete this action");
          } finally {
            setEasyViewDraftDeletePending(false);
          }
        }}
      />
      {easyViewBankSlipRowId != null && easyViewBankSlipPayload ? (
        <BankSlipDetailsModal
          open
          onClose={() => setEasyViewBankSlipRowId(null)}
          details={easyViewBankSlipPayload}
          allowRemoveFiles={!easyViewBankSlipReadOnly}
          onBankSlipFileDeleted={loadBills}
          inlineUploadBillContext={
            !easyViewBankSlipReadOnly && easyViewBankSlipRowId
              ? {
                  billId: easyViewBankSlipRowId,
                  currencyCode: easyViewBankSlipSourceRow?.currencyCode ?? "HKD",
                }
              : undefined
          }
          onInlineUploadSuccess={loadBills}
        />
      ) : null}
    </>
  );
}
