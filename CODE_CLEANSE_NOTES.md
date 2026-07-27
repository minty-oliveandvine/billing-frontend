# Code Cleanse Notes — `lib/`

Branch: `code-cleanse-lib`. Not pushed.

## Adaptation of the brief

The brief was written for a Python repo (pytest, ruff `F821`, isort, black,
`monkeypatch.setattr`, `patch("path.to.module.Name")`). This repo is
TypeScript/Next.js, so those tools have no analogue. Substitutions agreed with
the user:

| Brief (Python)                 | Here (TypeScript)                          |
| ------------------------------ | ------------------------------------------ |
| pytest baseline + diff         | `tsc --noEmit` + `npm run lint` + `npm run build` |
| `ruff check --select F821`     | `npx tsc --noEmit` (whole-project undefined-name/type check) |
| isort / black                  | ESLint (`npm run lint`); no formatter run alongside logic changes |
| `monkeypatch.setattr` scan     | module-boundary/import-coupling scan (below) |

**There is no test suite in this repo** — zero test files, no runner in
`package.json`. The "no test that passes today may start failing" rail is
therefore enforced via the three gates above instead.

## Baseline (recorded before any edit)

Captured in the session scratchpad (`baseline/tsc.txt`, `lint.json`,
`lint-summary.txt`, `build.txt`).

| Gate               | Result   | Detail                                  |
| ------------------ | -------- | --------------------------------------- |
| `npx tsc --noEmit` | ✅ exit 0 | 0 errors                                |
| `npm run lint`     | ❌ exit 1 | **55 problems (29 errors, 26 warnings)** |
| `npm run build`    | ✅ exit 0 | compiles, 9 static pages                |

Pre-existing failures **inside `lib/`** — these are the frozen baseline, NOT to
be fixed as part of this work:

```
lib/fileAttachmentPreview.tsx:158:13  warn   @next/next/no-img-element
lib/useUserRole.ts:106:5              error  react-hooks/set-state-in-effect
```

Rule from here on: after every step, re-run the three gates and diff against the
baseline. No message may be *added*. Pre-existing ones stay untouched.

## Survey — `lib/`

24 files, 2,817 LOC.

| File                             | LOC |
| -------------------------------- | --: |
| `api.ts`                         | 913 |
| `auth.ts`                        | 223 |
| `paymentRequestAttachmentStore.ts` | 186 |
| `fileAttachmentPreview.tsx`      | 184 |
| `useUserRole.ts`                 | 169 |
| `bankSlipEnrichment.ts`          | 165 |
| `amountFormat.ts`                | 151 |
| `dateDisplayFormat.ts`           |  95 |
| `paymentRequestBillMap.ts`       |  89 |
| `moduleClaims.ts`                |  89 |
| `compressImage.ts`               |  69 |
| `paymentRequestDateSort.ts`      |  66 |
| `mintyEnv.ts`                    |  60 |
| `mintyUrls.ts`                   |  58 |
| `paymentRequestRowSort.ts`       |  55 |
| `extractEmail.ts`                |  51 |
| `billFormSelectOptions.ts`       |  50 |
| `entityCurrency.ts`              |  42 |
| `billStatusDisplay.ts`           |  40 |
| `appScrollRoot.ts`               |  23 |
| `billStatusRollback.ts`          |  15 |
| `openDatePicker.ts`              |  13 |
| `paymentHistoryDisplay.ts`       |   6 |
| `currencyDisplay.ts`             |   5 |

Only `api.ts` exceeds the ~1000-line reformatter threshold at 913 — under it,
but close enough that no formatter run will be mixed into its logic commits.

## Load-bearing name scan (the `monkeypatch`/`patch` analogue)

In TS the equivalent risk is **module-boundary coupling**: a name whose defining
module matters to importers, or whose module-level side effects move if the name
moves.

Findings:

- **No `import * as` namespace imports anywhere** in `app/`, `components/`, `lib/`.
- **No re-export barrels inside `lib/`** — the only barrels are
  `components/payment-request/index.ts` and `components/layout/index.ts`, and
  neither re-exports from `lib/`.
- Every `lib/` consumer imports named bindings directly from the defining file.

**Conclusion: consolidation within `lib/` is low-risk** — there is no indirection
layer that would silently stop intercepting. The constraint that remains is the
ordinary one: any name I move must have its import sites updated, and `tsc`
will catch a miss.

## Duplication found (reported before changing anything)

### 1. `API_BASE` constant — 7 identical copies

```
lib/useUserRole.ts:10   lib/moduleClaims.ts:8   lib/api.ts:13   lib/auth.ts:11
app/page.tsx:11   app/module-selection/page.tsx:13   components/PdfJsCanvasPreview.tsx:57
```

All seven are byte-identical:
`process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000"`.

4 are in `lib/` (in scope); 3 are outside it. Extracting a shared constant that
`app/` and `components/` also import would make this a cross-subfolder change —
so per the brief it triggers the whole-folder `tsc` check.

### 2. JWT decode preamble — `getModuleClaims` vs `getPermissionClaims`

`lib/moduleClaims.ts:30-48` and `lib/useUserRole.ts:27-54`. The decode preamble
is logically identical in both:

```ts
const auth = getAuth();
if (!auth?.token) return <fallback>;
const parts = auth.token.split(".");
if (parts.length !== 3) return <fallback>;
const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
const payload = JSON.parse(payloadJson) as Record<string, unknown>;
// ...differs only in which claims are read...
// wrapped in try/catch returning <fallback>
```

**Behavioural difference (must be preserved, not merged away):** the two have
*different fallback shapes and different per-claim defaults* —
`moduleClaims` defaults its booleans to `true` (documented backward-compat
decision: a legacy token must never silently hide nav), while
`useUserRole` defaults to `""` / `null` / `false`. A naive merge that picked one
default would be a behaviour change. Safe extraction = a generic
`decodeJwtPayload(): Record<string, unknown> | null` that returns the raw
payload, leaving each caller's claim-reading and defaults exactly as they are.

### 3. Auth-header construction — 3 sites in `api.ts`, 2 more outside

`api.ts:64-66`, `api.ts:166-169`, `api.ts:207-215`, plus `moduleClaims.ts:72`
and `useUserRole.ts:118-122`.

**These are NOT interchangeable — do not blind-merge:**

| Site | `Authorization` | `X-Entity-Id` | `Accept` | `Content-Type` | Token absent |
| ---- | --- | --- | --- | --- | --- |
| `api.ts:64` (`apiFetch`) | ✅ | ✅ | — | `application/json` unless FormData | throws 401 + redirect |
| `api.ts:166` | ✅ | ✅ | `application/json` | — | throws 401 + redirect |
| `api.ts:207` (`authHeaders`) | conditional | conditional | `*/*` | — | **omits headers, no throw** |

The third deliberately tolerates a missing token and is used for a cross-origin
storage fetch that must *not* send `Authorization` (comment at `api.ts:224`
explains presigned-URL/CORS breakage). A shared builder is still possible but
needs flags (`accept`, `requireAuth`) to preserve all three behaviours.

### 4. Preamble duplication — token-refresh guard

`api.ts:50-62` and `api.ts:152-164` are a byte-identical 13-line block
(expiry check → refresh → redirect → `getAuth()` → 401 throw). Straightforward
extraction with no behavioural difference found.

## Deliberately left alone

- The two pre-existing `lib/` lint failures (baseline, see above) — out of scope
  per the brief.
- `next.config.ts` pdf.js asset copying — outside `lib/`.

## Progress log

### Step 1 — dead code (DONE, verified green)

- **Deleted `lib/openDatePicker.ts`** (13 LOC, single export `openDatePicker`).
  - Referenced **nowhere** — the only mention in the whole repo was its own
    definition. Not imported by any file; never imported in git history.
  - **Checked it was dead, not a bug:** the helper existed to open the native
    date picker for `.pr-date-input` fields. Those fields are still styled in
    `app/globals.css`, but `components/DateTextField.tsx` now opens the picker
    itself via `dateInputRef.current?.showPicker()` (line 50) with the same
    fallback-to-`focus()` logic. Its comment (line 29) explicitly states the
    separate `showPicker()` call "is no longer needed." So the helper was
    superseded and orphaned — safe delete, no behaviour lost.
  - **Verify:** `tsc` identical to baseline (0), lint identical (55 for real
    source), build exit 0. `tsc` re-parse of all files OK.

**Lesson / baseline correction:** the original lint baseline was captured
*before* `npm run build`, so it predated the generated vendor bundle
`public/pdfjs/pdf.worker.min.mjs` (copied out of `node_modules` by
`next.config.ts`, gitignored). Once built, ESLint lints that minified file and
emits ~1450 messages. This is pre-existing noise unrelated to any cleanse
change. Fix applied: **all lint diffs filter out `public/pdfjs/`**, and the
canonical `baseline/lint-summary.txt` was re-saved in filtered form (55 real-
source messages). Separately worth noting for later: `public/pdfjs/` arguably
belongs in an ESLint ignore, but that's config work outside `lib/` and out of
scope here.

## Status

Dead-code step for `lib/` complete and verified. Next: duplication, in the
agreed order — #4 token-refresh guard → #2 JWT decode → #3 narrow header helper
→ #1 API_BASE across all 7 sites (own commit).

**Paused for user review + commit of the dead-code step before starting the
duplication merges.**
