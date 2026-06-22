"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { PdfJsCanvasPreview } from "@/components/PdfJsCanvasPreview";
import { formatFileSize, FullFilePreviewLink, isImageFile, isPdfFile } from "@/lib/fileAttachmentPreview";
import { saveAttachmentBlobs } from "@/lib/paymentRequestAttachmentStore";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";

import { BillContactPicker } from "@/components/BillContactPicker";
import {
  ApiError,
  dedupeEntityBillContactsForPicker,
  fetchEntityBillAccounts,
  fetchEntityBillContacts,
  fetchSuggestedBillReference,
  isDuplicateBillReferenceError,
  saveBillDraft,
  submitBill,
  uploadBillAttachments,
} from "@/lib/api";
import type { EntityBillContact } from "@/lib/api";
import {
  BILL_CURRENCY_SELECT_OPTIONS,
  modalCurrencyToIsoCode,
} from "@/lib/billFormSelectOptions";
import { DateTextField } from "@/components/DateTextField";

export type PaymentRequestModalProps = {
  open: boolean;
  onClose: () => void;
  onSaveDraft?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
};

type UploadedEntry = { id: string; file: File };

/** Material Symbols icon + color for uploaded file row (Google Material Icons naming). */
function getUploadedFileIconInfo(filename: string): { icon: string; iconClass: string } {
  const ext = filename.trim().split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return { icon: "picture_as_pdf", iconClass: "text-red-600" };
  }
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "heic" || ext === "heif" || ext === "webp" || ext === "gif") {
    return { icon: "image", iconClass: "text-sky-600" };
  }
  if (ext === "xls" || ext === "xlsx" || ext === "xlsm") {
    return { icon: "table_chart", iconClass: "text-emerald-700" };
  }
  return { icon: "draft", iconClass: "text-primary" };
}

type ValidatedField =
  | "billNo"
  | "amount"
  | "contact"
  | "accountCode"
  | "invoiceDate"
  | "dueDate"
  | "attachments";

function parseAmountValue(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function validatePaymentRequestForm(values: {
  amount: string;
  contact: string;
  accountCode: string;
  invoiceDate: string;
  dueDate: string;
  attachmentCount: number;
}): Partial<Record<ValidatedField, string>> {
  const e: Partial<Record<ValidatedField, string>> = {};
  const n = parseAmountValue(values.amount);
  if (n === null) {
    e.amount = "Amount is required.";
  } else if (n <= 0) {
    e.amount = "Enter an amount greater than zero.";
  }
  if (!values.contact.trim()) {
    e.contact = "Supplier is required.";
  }
  if (!values.accountCode.trim()) {
    e.accountCode = "Account code is required.";
  }
  if (!values.invoiceDate.trim()) {
    e.invoiceDate = "Invoice date is required.";
  }
  if (!values.dueDate.trim()) {
    e.dueDate = "Due date is required.";
  }
  if (values.attachmentCount < 1) {
    e.attachments = "At least one attachment is required.";
  }
  return e;
}

function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold tracking-wide text-gray-700 sm:text-xs"
    >
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

export function PaymentRequestModal({
  open,
  onClose,
  onSaveDraft,
  onCancel,
  onConfirm,
}: PaymentRequestModalProps) {
  const router = useRouter();
  const titleId = useId();
  const previewSubtitleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedEntry[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const previewFile = previewFileId ? uploadedFiles.find((x) => x.id === previewFileId)?.file ?? null : null;
  const [billNo, setBillNo] = useState("");
  const [currency, setCurrency] = useState("HK$");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  /** Xero ContactID (empty while user is typing a new name). */
  const [contact, setContact] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ValidatedField, string>>>({});
  /** Non-field server message (e.g. other 422 validation). */
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [draftSubmitting, setDraftSubmitting] = useState(false);

  const [accountOptions, setAccountOptions] = useState<ThemedSelectOption[]>([]);

  const [contactsList, setContactsList] = useState<EntityBillContact[]>([]);
  const [contactsMap, setContactsMap] = useState<Map<string, EntityBillContact>>(new Map());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetchEntityBillAccounts({ billDropdown: true })
      .then((accounts) => {
        if (cancelled) return;
        const opts: ThemedSelectOption[] = accounts
          .filter((a) => a.is_active)
          .map((a) => ({
            value: `${a.account_code} - ${a.account_name}`,
            label: `${a.account_code} - ${a.account_name}`,
          }));
        setAccountOptions(opts);
        const defaultAcct = accounts.find((a) => a.is_default && a.is_active);
        if (defaultAcct) {
          const defaultVal = `${defaultAcct.account_code} - ${defaultAcct.account_name}`;
          setAccountCode((prev) => prev || defaultVal);
        }
      })
      .catch(() => {});

    fetchEntityBillContacts()
      .then((contacts) => {
        if (cancelled) return;
        const deduped = dedupeEntityBillContactsForPicker(contacts);
        const map = new Map<string, EntityBillContact>();
        for (const c of deduped) {
          map.set(c.xero_contact_id, c);
        }
        setContactsMap(map);
        setContactsList(deduped);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [open]);

  const clearFieldError = (key: ValidatedField) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!previewFile) {
      setPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(previewFile);
    setPreviewObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  useEffect(() => {
    if (previewFileId && !uploadedFiles.some((x) => x.id === previewFileId)) {
      setPreviewFileId(null);
    }
  }, [uploadedFiles, previewFileId]);

  useEffect(() => {
    if (!open) setPreviewFileId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewFileId) {
        setPreviewFileId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, previewFileId]);

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setFormError(null);
    setAmount("");
    setContact("");
    setContactInput("");
    setAccountCode("");
    setInvoiceDate(todayLocalISODate());
    setDueDate("");
    setBillNo("");
    setDescription("");
    setCurrency("HK$");
    setUploadedFiles([]);
    setPreviewFileId(null);
    let cancelled = false;
    fetchSuggestedBillReference()
      .then((r) => {
        if (!cancelled) setBillNo(r.reference);
      })
      .catch(() => {
        if (!cancelled) setBillNo("");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setConfirmSubmitting(false);
      setDraftSubmitting(false);
    }
  }, [open]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    const oversized = Array.from(list).filter((file) => file.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        attachments: `File${oversized.length > 1 ? "s" : ""} exceed the 10MB limit: ${oversized.map((f) => f.name).join(", ")}`,
      }));
      e.target.value = "";
      return;
    }
    const added: UploadedEntry[] = Array.from(list).map((file) => ({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
    }));
    setUploadedFiles((prev) => [...prev, ...added]);
    setPreviewFileId(added[added.length - 1]?.id ?? null);
    clearFieldError("attachments");
    e.target.value = "";
  };

  const removeFile = (entryId: string) => {
    setUploadedFiles((prev) => prev.filter((x) => x.id !== entryId));
  };

  const refetchEntityBillContacts = async (ensureMerged?: EntityBillContact) => {
    const list = await fetchEntityBillContacts();
    const mergedId = (ensureMerged?.xero_contact_id || "").trim().toUpperCase();
    let merged =
      ensureMerged &&
      mergedId &&
      !list.some(
        (c) => (c.xero_contact_id || "").trim().toUpperCase() === mergedId,
      )
        ? [...list, ensureMerged]
        : list;
    merged = dedupeEntityBillContactsForPicker(
      [...merged].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    const map = new Map<string, EntityBillContact>();
    for (const c of merged) {
      map.set(c.xero_contact_id, c);
    }
    setContactsMap(map);
    setContactsList(merged);
  };

  const handleSaveDraft = async () => {
    if (draftSubmitting) return;
    setFieldErrors({});
    setFormError(null);
    setDraftSubmitting(true);
    try {
      const parsedAmount = parseAmountValue(amount);
      const acctCode = accountCode.split(" - ")[0]?.trim() ?? "";

      const selectedContact = contactsMap.get(contact);
      const contactName = selectedContact?.name ?? contact;
      const bill = await saveBillDraft({
        contact: contactName || undefined,
        xero_contact_id: selectedContact?.xero_contact_id || undefined,
        description: description || undefined,
        amount: parsedAmount ?? undefined,
        currency_code: modalCurrencyToIsoCode(currency) || undefined,
        invoice_date: invoiceDate || undefined,
        due_date: dueDate || undefined,
        reference: billNo || undefined,
        xero_account_code: acctCode || undefined,
        line_items: acctCode || description || (parsedAmount && parsedAmount > 0)
          ? [
              {
                description: description || undefined,
                quantity: 1,
                unit_amount: parsedAmount ?? undefined,
                line_amount: parsedAmount ?? undefined,
                account_code: acctCode || undefined,
              },
            ]
          : undefined,
      });

      if (uploadedFiles.length > 0) {
        try {
          await uploadBillAttachments(bill.id, uploadedFiles.map((x) => x.file));
        } catch (e) {
          console.error("Failed to upload attachments:", e);
        }
      }

      try {
        await saveAttachmentBlobs(
          bill.id,
          uploadedFiles.map((x) => x.file),
        );
      } catch (e) {
        console.error("Could not store attachments for preview:", e);
      }

      onSaveDraft?.();
      onClose();
    } catch (err) {
      console.error("Failed to save draft:", err);
      if (isDuplicateBillReferenceError(err)) {
        setFieldErrors({ billNo: err.message });
      } else if (err instanceof ApiError && err.status === 422) {
        setFormError(err.message);
      } else {
        setFormError(
          err instanceof Error ? err.message : "Failed to save draft. Please try again.",
        );
      }
    } finally {
      setDraftSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const handleConfirm = async () => {
    const next = validatePaymentRequestForm({
      amount,
      contact,
      accountCode,
      invoiceDate,
      dueDate,
      attachmentCount: uploadedFiles.length,
    });
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    if (confirmSubmitting) return;
    setConfirmSubmitting(true);
    try {
      const parsedAmount = parseAmountValue(amount) ?? 0;
      const acctCode = accountCode.split(" - ")[0]?.trim() ?? "";

      const selectedContact = contactsMap.get(contact);
      const contactName = selectedContact?.name ?? contact;
      const bill = await submitBill({
        contact: contactName,
        xero_contact_id: selectedContact?.xero_contact_id || undefined,
        description,
        amount: parsedAmount,
        currency_code: modalCurrencyToIsoCode(currency),
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        reference: billNo,
        xero_account_code: acctCode || undefined,
        line_items: [
          {
            description,
            quantity: 1,
            unit_amount: parsedAmount,
            line_amount: parsedAmount,
            account_code: acctCode,
          },
        ],
      });

      if (uploadedFiles.length > 0) {
        try {
          await uploadBillAttachments(bill.id, uploadedFiles.map((x) => x.file));
        } catch (e) {
          console.error("Failed to upload attachments:", e);
        }
      }

      try {
        await saveAttachmentBlobs(
          bill.id,
          uploadedFiles.map((x) => x.file),
        );
      } catch (e) {
        console.error("Could not store attachments for preview:", e);
      }

      onConfirm?.();
      onClose();
      router.push(`/payment-request/${encodeURIComponent(bill.id)}`);
    } catch (err) {
      console.error("Failed to create bill:", err);
      if (isDuplicateBillReferenceError(err)) {
        setFieldErrors({ billNo: err.message });
      } else if (err instanceof ApiError && err.status === 422) {
        setFormError(err.message);
      } else {
        setFormError(
          err instanceof Error ? err.message : "Failed to create bill. Please try again.",
        );
      }
    } finally {
      setConfirmSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-x-hidden overscroll-x-none p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4 md:p-6" role="presentation">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={previewFile ? previewSubtitleId : undefined} className="relative z-[1] flex max-h-[min(100dvh-1rem,880px)] w-full min-w-0 max-w-[520px] flex-col rounded-xl bg-white shadow-xl ring-1 ring-black/5 sm:max-h-[min(92dvh,880px)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-4 sm:gap-4 sm:px-6 sm:pb-4 sm:pt-6">
          <h2 id={titleId} className="min-w-0 pr-2 text-lg font-bold leading-snug text-black sm:text-xl md:text-2xl">
            Add Payment Request
          </h2>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-primary transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary" aria-label="Close">
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-6">
            <div className="min-w-0">
              {previewFile && previewObjectUrl ? (
                <PaymentRequestInlinePreview file={previewFile} objectUrl={previewObjectUrl} previewSubtitleId={previewSubtitleId} getUploadedFileIconInfo={getUploadedFileIconInfo} />
              ) : previewFile && !previewObjectUrl ? (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-primary/60 sm:min-h-[176px]">Loading preview…</div>
              ) : (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-primary/60 sm:min-h-[176px]">Select a file to preview</div>
              )}
            </div>

          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
              Uploaded files ({uploadedFiles.length})
            </p>
            {uploadedFiles.length > 0 ? (
              <span className="shrink-0 text-[10px] font-medium text-primary/55 sm:text-[11px]">Click the file to preview</span>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">
            {uploadedFiles.map(({ id, file }) => {
              const { icon, iconClass } = getUploadedFileIconInfo(file.name);
              const selected = previewFileId === id;
              return (
              <li key={id} className={"relative flex items-center justify-start rounded-lg border bg-white px-3 py-2.5 pr-11 sm:gap-2 sm:pr-3 " + (selected ? "border-secondary/50 ring-2 ring-secondary/20" : "border-gray-300")}>
                <button type="button" onClick={() => setPreviewFileId(id)} className="flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 rounded-md text-left" aria-pressed={selected} aria-label={`Preview ${file.name}`}>
                  <span className={`material-symbols-outlined shrink-0 text-[22px] leading-none sm:text-[26px] ${iconClass}`} aria-hidden>{icon}</span>
                  <span className="min-w-0 break-words text-left text-sm leading-snug text-black sm:flex-1 sm:truncate sm:leading-normal">{file.name}</span>
                </button>
                <button type="button" onClick={() => removeFile(id)} className="absolute right-2 top-1/2 flex h-8 w-8 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-primary/60 transition-colors hover:bg-gray-100 hover:text-primary sm:static sm:translate-y-0" aria-label={`Remove ${file.name}`}>
                  <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>close</span>
                </button>
              </li>
            );
            })}
          </ul>

          <div className="relative">
            <input ref={fileInputRef} type="file" className="absolute inset-0 z-20 h-full min-h-[156px] w-full cursor-pointer opacity-0 sm:min-h-[176px]" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.xls,.xlsx,.xlsm,application/pdf,image/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFilesSelected} aria-label="Choose files to upload" />
            <div className="pointer-events-none">
              <div className="flex min-h-[156px] flex-col items-center justify-center gap-3 overflow-visible rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 sm:min-h-[176px] sm:gap-4 sm:py-6">
                <span className="material-symbols-outlined inline-block origin-center text-[48px] leading-none text-gray-400 [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_48] scale-[1.78] sm:text-[48px] sm:scale-[2.02]" aria-hidden>cloud_upload</span>
                <div className="flex flex-col items-center">
                  <p className="px-2 text-center text-[14px] font-medium leading-tight text-gray-700">Click or drag files here to upload</p>
                  <p className="mt-1 px-2 text-center text-[12px] leading-tight text-gray-400">PDF, JPEG, PNG (Max 10MB)</p>
                </div>
              </div>
            </div>
          </div>

          {fieldErrors.attachments ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {fieldErrors.attachments}
            </p>
          ) : null}

          {formError ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">{formError}</div>
          ) : null}

          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel htmlFor="pr-bill-no">Bill No.</FieldLabel>
              <input
                id="pr-bill-no"
                type="text"
                value={billNo ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  clearFieldError("billNo");
                  setFormError(null);
                  if (v.trim() === "") {
                    setBillNo("");
                    void fetchSuggestedBillReference()
                      .then((r) => setBillNo(r.reference))
                      .catch(() => {});
                    return;
                  }
                  setBillNo(v);
                }}
                aria-invalid={!!fieldErrors.billNo}
                aria-describedby={fieldErrors.billNo ? "pr-bill-no-error" : undefined}
                className={
                  "box-border h-11 min-h-[44px] w-full rounded-2xl border bg-white px-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 sm:min-h-11 sm:text-sm " +
                  (fieldErrors.billNo
                    ? "border-red-500 focus:border-red-500 focus:ring-red-200/50"
                    : "border-gray-300 focus:border-secondary focus:ring-secondary/25")
                }
                placeholder="MBIOVI-115803031626"
              />
              {fieldErrors.billNo ? (
                <p id="pr-bill-no-error" className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.billNo}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
              <div>
                <FieldLabel htmlFor="pr-invoice-date" required>
                  Invoice Date
                </FieldLabel>
                <DateTextField
                  id="pr-invoice-date"
                  value={invoiceDate ?? ""}
                  onChange={(iso) => {
                    setInvoiceDate(iso);
                    clearFieldError("invoiceDate");
                  }}
                  invalid={!!fieldErrors.invoiceDate}
                  calendarAriaLabel="Open calendar for invoice date"
                  textInputClassName={
                    "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border bg-white py-0 pl-3 pr-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 [color-scheme:light] sm:min-h-11 sm:text-sm " +
                    (fieldErrors.invoiceDate
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200/50"
                      : "border-gray-300 focus:border-secondary focus:ring-secondary/25")
                  }
                  calendarButtonClassName="hidden"
                />
                {fieldErrors.invoiceDate ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.invoiceDate}
                  </p>
                ) : null}
              </div>
              <div>
                <FieldLabel htmlFor="pr-due-date" required>
                  Due Date
                </FieldLabel>
                <DateTextField
                  id="pr-due-date"
                  value={dueDate ?? ""}
                  onChange={(iso) => {
                    setDueDate(iso);
                    clearFieldError("dueDate");
                  }}
                  invalid={!!fieldErrors.dueDate}
                  calendarAriaLabel="Open calendar for due date"
                  textInputClassName={
                    "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border bg-white py-0 pl-3 pr-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 [color-scheme:light] sm:min-h-11 sm:text-sm " +
                    (fieldErrors.dueDate
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200/50"
                      : "border-gray-300 focus:border-secondary focus:ring-secondary/25")
                  }
                  calendarButtonClassName="hidden"
                />
                {fieldErrors.dueDate ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.dueDate}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="pr-amount" required>
                Amount
              </FieldLabel>
              <div className="flex min-w-0 flex-row gap-0">
                <ThemedSelect
                  id="pr-currency"
                  ariaLabel="Currency"
                  value={currency ?? ""}
                  onChange={setCurrency}
                  options={BILL_CURRENCY_SELECT_OPTIONS}
                  className="w-24 shrink-0"
                  fullWidth
                  uniformFill
                  error={!!fieldErrors.amount}
                  triggerClassName={
                    fieldErrors.amount
                      ? "w-full px-2 sm:px-3 rounded-l-2xl rounded-r-none border-r-0 border-red-500 bg-white text-black hover:bg-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200/50"
                      : "w-full px-2 sm:px-3 rounded-l-2xl rounded-r-none border-r-0 bg-white text-black hover:bg-white"
                  }
                />
                <input
                  id="pr-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount ?? ""}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    clearFieldError("amount");
                  }}
                  placeholder="0.00"
                  aria-invalid={!!fieldErrors.amount}
                  className={
                    "box-border h-11 min-h-[44px] min-w-0 flex-1 rounded-l-none rounded-r-2xl border border-l-0 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 sm:min-h-11 sm:text-sm " +
                    (fieldErrors.amount
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200/50"
                      : "border-gray-300 focus:border-secondary focus:ring-secondary/25")
                  }
                />
              </div>
              {fieldErrors.amount ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.amount}
                </p>
              ) : null}
            </div>

            <div>
              <FieldLabel htmlFor="pr-description">Description</FieldLabel>
              <input
                id="pr-description"
                type="text"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm"
              />
            </div>

            <div>
              <FieldLabel htmlFor="pr-contact" required>
                Supplier
              </FieldLabel>
              <BillContactPicker
                id="pr-contact"
                contacts={contactsList}
                xeroContactId={contact}
                contactName={contactInput}
                onChange={({ xero_contact_id, contact: nm }) => {
                  setContact(xero_contact_id);
                  setContactInput(nm);
                  clearFieldError("contact");
                }}
                refetchContacts={refetchEntityBillContacts}
                error={!!fieldErrors.contact}
              />
              {fieldErrors.contact ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.contact}
                </p>
              ) : null}
            </div>

            <div>
              <FieldLabel htmlFor="pr-account" required>
                Account Code
              </FieldLabel>
              <ThemedSelect
                id="pr-account"
                value={accountCode ?? ""}
                onChange={(v) => {
                  setAccountCode(v);
                  clearFieldError("accountCode");
                }}
                options={accountOptions}
                placeholder="Select an account code"
                error={!!fieldErrors.accountCode}
                triggerClassName="!rounded-2xl"
                plainChevron
                searchable
              />
              {fieldErrors.accountCode ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.accountCode}
                </p>
              ) : null}
            </div>
          </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-gray-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5 sm:pb-5">
          <div className="order-1 flex w-full min-w-0 gap-2">
            <button type="button" onClick={handleCancel} className="box-border h-12 min-h-[48px] min-w-0 flex-1 cursor-pointer rounded-lg border-2 border-secondary bg-white px-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10">
              Cancel
            </button>
            <button type="button" onClick={() => void handleConfirm()} disabled={confirmSubmitting} className="box-border h-12 min-h-[48px] min-w-0 flex-1 rounded-lg border border-transparent bg-secondary px-4 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
              {confirmSubmitting ? "Confirming…" : "Confirm"}
            </button>
          </div>
          <button type="button" onClick={() => void handleSaveDraft()} disabled={draftSubmitting} className="order-2 box-border h-12 min-h-[48px] w-full rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-primary transition-colors hover:bg-gray-50 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
            {draftSubmitting ? "Saving…" : "Save as Draft"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PaymentRequestInlinePreview({
  file,
  objectUrl,
  previewSubtitleId,
  getUploadedFileIconInfo,
}: {
  file: File;
  objectUrl: string;
  previewSubtitleId: string;
  getUploadedFileIconInfo: (filename: string) => { icon: string; iconClass: string };
}) {
  const { icon, iconClass } = getUploadedFileIconInfo(file.name);
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-3 pb-2">
        <span className={`material-symbols-outlined mt-0.5 shrink-0 text-[28px] leading-none sm:text-[32px] ${iconClass}`} aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-black sm:text-base">{file.name}</p>
          <p id={previewSubtitleId} className="mt-1 text-[11px] font-medium tracking-wide text-primary/55 sm:text-xs">
            Document preview<span className="text-primary/35"> • </span>
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <FullFilePreviewLink
        href={objectUrl}
        className="mt-3 min-h-[min(60dvh,420px)] overflow-auto rounded-lg bg-black/5 p-2 sm:p-3"
      >
        {isImageFile(file) ? (
          <img src={objectUrl} alt={`Preview: ${file.name}`} className="mx-auto max-h-[min(65dvh,620px)] w-auto max-w-full object-contain" />
        ) : null}
        {isPdfFile(file) && !isImageFile(file) ? (
          <PdfJsCanvasPreview src={objectUrl} title={file.name} className="w-full" maxPageWidthCssPx={640} />
        ) : null}
        {!isImageFile(file) && !isPdfFile(file) ? (
          <p className="py-8 text-center text-sm text-primary/70">Preview is not available for this file type.</p>
        ) : null}
      </FullFilePreviewLink>
    </div>
  );
}
