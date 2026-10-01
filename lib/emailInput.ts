// COPY of minty-web/lib/emailInput.ts (2026-10-01) - lifted into @minty/shared at Part 3;
// change every copy (minty-web, here, onboarding, the landing page, Flask static/js/email_input.js).

/**
 * Email fields take English only: printable ASCII, nothing else (the user's call, 2026-10-01).
 *
 * Why the fields are `type="text" inputMode="email"` and not `type="email"`: the browser's
 * email input refuses Hangul before the "@" but accepts it after, as an international domain,
 * and then hands `.value` back as punycode (`xn--…`) - ASCII to every check here, Korean on
 * screen. It also hides the caret position, so a strip could not keep it. `inputMode` keeps the
 * email keyboard on phones.
 *
 * The strip waits for an IME composition to finish: rewriting the value mid-composition makes
 * the Korean IME duplicate characters. So a syllable can show for a moment, then goes, and the
 * hint says why.
 */

import {
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type InputHTMLAttributes,
} from "react";

export const EMAIL_ASCII_HINT = "Email can only contain English letters, numbers and symbols.";

const NOT_EMAIL_CHAR = /[^\x21-\x7E]/g;
const NON_ASCII = /[^\x00-\x7F]/;

/** One "@", something either side, a dot in the domain - printable ASCII only. Deliberately
 *  shallow (`a+b@sub.domain.museum` must pass); the same rule as onboarding's and the API's. */
export const EMAIL_RE = /^[\x21-\x3F\x41-\x7E]+@[\x21-\x3F\x41-\x7E]+\.[\x21-\x3F\x41-\x7E]+$/;

export function isEmail(value: unknown): boolean {
  return EMAIL_RE.test(String(value ?? "").trim());
}

/** True when `value` holds a character no email field accepts (Korean, accents, emoji...). */
export function hasNonAsciiEmailChar(value: string): boolean {
  return NON_ASCII.test(value);
}

/** Drops everything but printable ASCII - whitespace included, which no address contains. */
export function sanitizeEmailInput(value: string): string {
  return value.replace(NOT_EMAIL_CHAR, "");
}

type EmailInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "type"
  | "inputMode"
  | "autoComplete"
  | "autoCapitalize"
  | "autoCorrect"
  | "spellCheck"
  | "onChange"
  | "onCompositionEnd"
>;

/**
 * Spread `props` on the email `<input>` (after any `type`/`onChange` of its own) and render
 * `EMAIL_ASCII_HINT` while `rejected`. `onValue` gets the cleaned value; during a composition
 * it gets the raw one, so a controlled input does not fight the IME.
 */
export function useEmailInput(onValue?: (value: string) => void): {
  props: EmailInputProps;
  rejected: boolean;
} {
  const [rejected, setRejected] = useState(false);

  const settle = (el: HTMLInputElement) => {
    const raw = el.value;
    const clean = sanitizeEmailInput(raw);
    if (clean !== raw) {
      const caret = sanitizeEmailInput(raw.slice(0, el.selectionStart ?? raw.length)).length;
      el.value = clean;
      el.setSelectionRange(caret, caret);
    }
    setRejected(hasNonAsciiEmailChar(raw));
    onValue?.(clean);
  };

  return {
    rejected,
    props: {
      type: "text",
      inputMode: "email",
      autoComplete: "email",
      autoCapitalize: "none",
      autoCorrect: "off",
      spellCheck: false,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        if ((e.nativeEvent as InputEvent).isComposing) onValue?.(e.currentTarget.value);
        else settle(e.currentTarget);
      },
      onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => settle(e.currentTarget),
    },
  };
}
