# Error copy

How a failure becomes something a user can read. The copy standard is shared
across Minty, billing-backend, billing-frontend and onboarding; the canonical
write-up lives in the Minty repo as `ERROR_MESSAGE_LEAKS.md`.

## The standard

> `I couldn't <do the specific thing>. <Short next step>?`

1. Under two sentences.
2. First person -- not `Error:`, not `Failed to`.
3. Name the specific thing: *"that invoice"*, not *"the operation"*.
4. Warm close, no blame. Drop the apology when retrying won't help (a validation
   error, a hard limit) and state the requirement instead:
   `Files need to be under 10MB.`
5. No codes, stack text or HTTP statuses in the visible string. That goes to the log.
6. Sentence case, no `Error:` prefix, no exclamation marks on failures.

House fallback for unknown causes:
`Something went wrong on my end. Mind trying again?`

## The mechanism

Two clients, both normalising, both in `lib/`:

| File | Talks to | Error type |
|---|---|---|
| `lib/api.ts` | the Django billing backend (`API_BASE/api/v1`) | `ApiError` |
| `lib/payerPortal.ts` | the Minty Flask origin | `PortalError` |

`resolveApiErrorMessage` decides what a user sees. It shows the server's own
`detail` only when that text survives two guards:

- **`normalizeApiErrorDetail`** flattens what the server sent into a string.
  django-ninja answers a schema failure with `detail: [{type, loc, msg}, ...]`;
  stringifying that put `{"type":"missing","loc":["body","email"]}` in front of
  payers. Pydantic entries are reduced to their `msg`, field-error maps to their
  values, and anything still object-shaped is dropped rather than rendered as
  `[object Object]`.
- **`readsAsProse`** rejects text that is machinery rather than a sentence:
  markup, braces, stack text, or a bare machine code like `invalid_state`.

Anything refused falls back to `STATUS_FALLBACK_MESSAGES` for the status.

### `ApiError.detail` vs `ApiError.message`

`message` is the scrubbed copy a user reads. **`detail` is the server's raw
text**, kept because `isXeroAuthError` and `isDuplicateBillReferenceError` match
on shapes -- Xero rejection payloads, specifically -- that `message` is now
scrubbed of. Match on `detail`, render `message`.

## When you add a `fetch()`

Go through `apiFetch` / `portalGet` / `portalPost`. If you must catch directly,
narrow to `ApiError`:

```ts
// Wrong: apiFetch does not wrap network failures, so a dropped connection is a
// raw TypeError and the user reads "Failed to fetch".
err instanceof Error ? err.message : "I couldn't load that. Mind trying again?"

// Right:
err instanceof ApiError ? err.message : "I couldn't load that. Mind trying again?"
```

## Deliberate exceptions

`components/profile/AddPaymentMethodModal.tsx` shows Stripe.js `error.message`
verbatim. The issuer's decline text is the only account of what actually
happened, and it is written for cardholders. See the comment there.
