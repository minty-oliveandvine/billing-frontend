/** Opens the native date picker; used because `.pr-date-input` hides the built-in icon (globals.css). */
export function openDatePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) return;
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
      return;
    } catch {
      /* showPicker can throw outside a user gesture or on unsupported hosts */
    }
  }
  input.focus();
}
