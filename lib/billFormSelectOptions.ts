import type { ThemedSelectOption } from "@/components/ThemedSelect";

export const BILL_CONTACT_SELECT_OPTIONS: ThemedSelectOption[] = [
  { value: "", label: "Select contact" },
  { value: "Young Bros Transport", label: "Young Bros Transport" },
  { value: "Other contact", label: "Other contact" },
];

export const BILL_ACCOUNT_SELECT_OPTIONS: ThemedSelectOption[] = [
  { value: "425 - Transport", label: "425 - Transport" },
  { value: "400 - General", label: "400 - General" },
];

/** If the current value is not in the static list, prepend it so the select can show it. */
export function mergeSelectOption(
  options: ThemedSelectOption[],
  value: string,
  label?: string,
): ThemedSelectOption[] {
  if (!value || options.some((o) => o.value === value)) return options;
  return [{ value, label: label ?? value }, ...options];
}

/**
 * Line items often return only `account_code` with an empty `account_name`. Resolve to the same
 * "CODE - Name" value as the account dropdown when the entity chart has been loaded.
 */
export function enrichAccountCodeWithOptions(
  stored: string,
  options: ThemedSelectOption[],
): string {
  const s = stored.trim();
  if (!s) return "";

  const sepIdx = s.indexOf(" - ");
  const namePart = sepIdx >= 0 ? s.slice(sepIdx + 3).trim() : "";
  if (namePart) return s;

  const code = sepIdx >= 0 ? s.slice(0, sepIdx).trim() : s;
  if (!code) return s;

  for (const o of options) {
    const v = o.value.trim();
    if (!v) continue;
    if (v === code || v.startsWith(`${code} -`)) {
      return v;
    }
  }
  return s;
}
