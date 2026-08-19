/**
 * The payer portal — the second thing this app fetches from Minty directly.
 *
 * Same reason as `subscriptionNotice`: subscription state lives only in Minty, so this
 * calls Minty's origin with the billing JWT this app already holds (Minty signs it, so
 * Minty can verify it). Everything else still goes to the billing backend.
 *
 * The posture is the OPPOSITE of the notice's, though, and deliberately. A notice is an
 * interruption — if it fails, showing nothing is right. This is the page's entire
 * content: an empty table where a failure happened reads as "you pay for nothing", which
 * is a worse lie than an error the user can retry from. So this one throws.
 *
 * Note the request carries no entity id. The endpoint filters on the payer, which is the
 * user in the token — the screen spans every company they pay for, and there is nothing
 * in the request that could be pointed at somebody else's.
 */
import {
  getAuth,
  isTokenExpiringSoon,
  refreshToken,
} from "./auth";
import { resolveMintyModuleUrl } from "./mintyEnv";

/**
 * Seven statuses, not the four the design draws swatches for. `past_due`, `ended` and
 * `trial_expired` are splits of what would otherwise be a grey "not subscribed" that
 * lies: one is live and owes money, one PAID and ran out, one only ever had free days.
 * `ended` and `trial_expired` are told apart by whether the module was ever billed —
 * calling a lapsed subscription an expired trial denies a purchase the customer made.
 */
export type ModuleStatus =
  | "active"
  | "trialing"
  | "cancelled"
  | "past_due"
  | "ended"
  | "trial_expired"
  | "not_subscribed";

export type PortalModule = {
  code: string;
  name: string;
  status: ModuleStatus;
  /** What the badge reads, e.g. "free trial". Server-owned so both apps say it the same way. */
  status_label: string;
  /** "Next billing" / "Trial ends" / "Expires" / "Access ends" / "Ended", or null. */
  date_label: string | null;
  /** Already formatted — "15 Aug 2026". Null when there is no date to show. */
  date: string | null;
  date_iso: string | null;
};

export type PortalEntity = {
  entity_id: string;
  entity_name: string;
  country: string | null;
  country_code: string | null;
  subscriber: { id: string; name: string; email: string };
  modules: PortalModule[];
  /** A Minty PATH. Hand the token back through `buildEnterUrl` to land on it signed in. */
  settings_path: string;
};

export type PayerSubscriptions = {
  payer: { id: string; name: string; email: string };
  billing: {
    anchor: string | null;
    anchor_iso: string | null;
    paid_through: string | null;
    paid_through_iso: string | null;
    currency: string | null;
  };
  entities: PortalEntity[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
  sort: SortField;
  direction: SortDirection;
  query: string;
};

export const SORT_FIELDS = [
  "entity",
  "subscriber",
  "country",
  "modules",
  "status",
  "next_billing",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export type PayerSubscriptionsParams = {
  query?: string;
  sort?: SortField;
  direction?: SortDirection;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

// --- Change subscriber (read only) ------------------------------------------

/**
 * A person the entity's bill could be handed to. ADMINS only — a cashier cannot be made
 * responsible for a company's subscription, so offering one would be offering a choice
 * that has to be refused.
 *
 * The current payer is always first and always present, even if they have since been
 * demoted: the banner above the list names them, and a list without them contradicts it.
 */
export type SubscriberCandidate = {
  id: string;
  name: string;
  email: string;
  is_current: boolean;
  /**
   * What THIS person would be charged to take the company on, or null if it could not be
   * priced. Per candidate, not per entity: the window ends at the recipient's own period
   * end, derived from their billing anchor, so two admins whose cycles turn over on
   * different days pay different amounts for the same handover.
   */
  quote?: TransferQuote | null;
  /**
   * Trials THIS person would inherit — free days now, a charge on their card at the
   * conversion date. Per candidate for the same reason the quote is.
   */
  trials?: InheritedTrial[];
};

/** What taking a company over costs the incoming payer, priced by Minty. */
export type TransferQuote = {
  amount: number;
  currency: string;
  /**
   * The window actually CHARGED — from the handover instant, not from the start of the
   * incoming payer's period. They differ by design: the period is that payer's whole
   * cycle, and they only pay the part of it after the outgoing payer's money runs out.
   * Quoting `period_start` tells someone they are paying for days already paid for.
   */
  covers_from: string;
  covers_to: string;
  period_start: string;
  period_end: string;
  anchor_at: string;
  /** True when this handover is what establishes their billing date. Worth saying. */
  anchor_is_new: boolean;
};

/**
 * A free trial the incoming payer would INHERIT — free days now, a charge on their card
 * at `trial_end`. One entry per conversion DATE, not per module: modules ending together
 * convert in one bundled charge, and quoting them separately would show amounts that sum
 * to more than the customer is charged.
 */
export type InheritedTrial = {
  /**
   * What the set is CALLED — the plan's own name, e.g. "Super Minty" for the bundle
   * rather than "Petty Cash and Payment Request". Named by the set because it is priced
   * by the set, and because that is the name that appears on the invoice.
   */
  label: string;
  codes: string[];
  trial_end: string;
  /** Null when it could not be priced — the trial is still disclosed without a figure. */
  amount: number | null;
  currency: string | null;
  /** True when this conversion is what will set their monthly billing date. */
  anchor_is_new: boolean | null;
};

export type PendingTransfer = {
  id: string;
  to_user_id: string;
  status: string;
  since: string;
};

export type SubscriberOptions = {
  entity: { entity_id: string; entity_name: string };
  current: { id: string; name: string; email: string };
  candidates: SubscriberCandidate[];
  /**
   * Why the handover cannot go ahead, in Minty's words, or empty. Computed server-side so
   * the screen can SAY so before the click — the alternative is learning that a trial is
   * running by attempting a handover and being refused.
   */
  blockers?: string[];
  /** An offer already waiting on this company. At most one. */
  pending_transfer?: PendingTransfer | null;
};

/** A handover offered TO the signed-in user. */
export type IncomingTransfer = {
  id: string;
  entity_id: string;
  entity_name: string;
  from_name: string;
  from_user_id: string;
  status: string;
  expires_at: string;
  amount: number | null;
  currency: string | null;
  quote: TransferQuote | null;
  trials: InheritedTrial[];
  blockers: string[];
};

export class PortalError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

/** Copy in the app's voice, keyed by what actually went wrong. */
const MESSAGES: Record<number, string> = {
  401: "Your session ran out while you were away. Let's sign you back in?",
  403: "Hmm, I can't let you in there.",
  500: "Something got stuck on my end! Let's try again?",
};

function mintyOrigin(): string {
  return resolveMintyModuleUrl().replace(/\/$/, "");
}

/**
 * Minty entry URL for ANY entity, not just the one in the cookie.
 *
 * `mintyUrls.buildMintyEnterUrl` can only reach the entity the billing JWT was minted
 * for, which is exactly wrong here — the whole point of this screen is the other ones.
 * Minty's `/enter` route re-establishes the session from the token's USER and then
 * redirects to `next`; the destination page applies its own access and permission gates,
 * so this hands over a target rather than an authorisation.
 */
export function buildEnterUrl(entityId: string, nextPath: string): string {
  const auth = getAuth();
  const base = mintyOrigin();
  if (!auth?.token) return `${base}/entity`;
  return (
    `${base}/entity/${encodeURIComponent(entityId)}/enter` +
    `?token=${encodeURIComponent(auth.token)}&next=${encodeURIComponent(nextPath)}`
  );
}

async function request(url: string, token: string, signal?: AbortSignal) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}

/**
 * One GET against a payer-portal endpoint, with the token handling both of them need.
 *
 * Throws `PortalError` on anything that isn't a payload — including the network failing,
 * so a caller has one thing to catch. An `AbortError` is rethrown untouched: that is the
 * caller changing its mind, not a failure, and it must stay recognisable.
 */
async function portalGet<T>(
  path: string,
  search: URLSearchParams,
  signal?: AbortSignal,
): Promise<T> {
  const auth = getAuth();
  if (!auth?.token) {
    throw new PortalError(401, MESSAGES[401]);
  }

  const query = search.toString();
  const url = `${mintyOrigin()}${path}${query ? `?${query}` : ""}`;

  // The billing JWT lives 30 minutes but its cookie lives 8 hours, so a tab left open
  // holds a token Minty will reject long before the cookie disappears. Refresh up front
  // rather than burning the first attempt on a guaranteed 401.
  let token = auth.token;
  if (isTokenExpiringSoon() && (await refreshToken())) {
    token = getAuth()?.token ?? token;
  }

  let res: Response;
  try {
    res = await request(url, token, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new PortalError(0, "I couldn't reach the server just now. Let's try again?");
  }

  // One retry behind a refresh: the token may have aged out between the check above and
  // the request, and Minty is the only judge of that.
  if (res.status === 401 && (await refreshToken())) {
    const fresh = getAuth()?.token;
    if (fresh) res = await request(url, fresh, signal);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new PortalError(
      res.status,
      body?.error && !/^[a-z_]+$/.test(body.error)
        ? body.error
        : MESSAGES[res.status] ?? "Something got stuck on my end! Let's try again?",
    );
  }

  return (await res.json()) as T;
}

/** Every entity the signed-in user PAYS FOR, one page at a time. */
export async function fetchPayerSubscriptions(
  params: PayerSubscriptionsParams = {},
): Promise<PayerSubscriptions> {
  const search = new URLSearchParams();
  if (params.query?.trim()) search.set("q", params.query.trim());
  if (params.sort) search.set("sort", params.sort);
  if (params.direction) search.set("direction", params.direction);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("per_page", String(params.perPage));

  const data = await portalGet<PayerSubscriptions>(
    "/api/me/subscriptions",
    search,
    params.signal,
  );
  if (!data || !Array.isArray(data.entities)) {
    throw new PortalError(502, "That came back in a shape I didn't expect. Let's try again?");
  }
  return data;
}

/**
 * Who ONE entity's subscription could be billed to instead.
 *
 * The only payer-portal read that names an entity in the request, so it is the only one
 * that can 404: Minty answers it solely for the entity's own payer. Read-only — moving
 * the bill to someone else has no route yet, which is why the screen's actions are off.
 */
export async function fetchSubscriberOptions(
  entityId: string,
  signal?: AbortSignal,
): Promise<SubscriberOptions> {
  const search = new URLSearchParams({ entity: entityId });
  const data = await portalGet<SubscriberOptions>(
    "/api/me/subscriptions/subscriber-options",
    search,
    signal,
  );
  if (!data?.entity || !Array.isArray(data.candidates)) {
    throw new PortalError(502, "That came back in a shape I didn't expect. Let's try again?");
  }
  return data;
}

/**
 * Invite someone into an entity as an ADMIN. Resolves to the server's confirmation.
 *
 * This adds a MEMBER; it does not move the payer. Handing the bill over is a separate
 * flow that has to survive the period already paid for, and is still switched off.
 *
 * A 422 carries a stated reason the form shows against the field — "already a member",
 * "an invitation is already pending" — so its message passes through untouched.
 */
export async function inviteAdminToEntity(
  entityId: string,
  email: string,
): Promise<string> {
  const auth = getAuth();
  if (!auth?.token) throw new PortalError(401, MESSAGES[401]);

  let token = auth.token;
  if (isTokenExpiringSoon() && (await refreshToken())) {
    token = getAuth()?.token ?? token;
  }

  const url = `${mintyOrigin()}/api/me/subscriptions/invite-admin`;
  const send = (bearer: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity: entityId, email }),
    });

  let res: Response;
  try {
    res = await send(token);
  } catch {
    throw new PortalError(0, "I couldn't reach the server just now. Let's try again?");
  }
  if (res.status === 401 && (await refreshToken())) {
    const fresh = getAuth()?.token;
    if (fresh) res = await send(fresh);
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; message?: string; error?: string }
    | null;

  if (!res.ok || !body?.ok) {
    throw new PortalError(
      res.status,
      body?.error && !/^[a-z_]+$/.test(body.error)
        ? body.error
        : MESSAGES[res.status] ?? "That invitation didn't send. Let's try again?",
    );
  }
  return body.message ?? "Invitation sent.";
}

// --- Saved payment methods --------------------------------------------------

/**
 * One method saved against the payer's Stripe customer.
 *
 * THE DEFAULT IS THE ONLY ONE WITH BILLING MEANING. Renewals and dunning charge
 * `invoice_settings.default_payment_method` and nothing else, so the rest of the shelf is
 * there for the payer to prepare a switch — add next year's card before this year's
 * expires — not for anything to choose between at charge time. Promoting one therefore
 * changes what charges EVERY company on the account, because there is one account.
 *
 * `card` fields are null for a wallet (Stripe Link exposes no card object); `label` is
 * always safe to print.
 */
export type SavedPaymentMethod = {
  id: string;
  /** "card", or a wallet type such as "link". */
  type: string;
  brand: string | null;
  /** "Visa" / "Mastercard" / "Link" — already title-cased. */
  brand_label: string;
  last4: string | null;
  /** The one-line description — "Visa •••• 4242". */
  label: string;
  /** Stripe's `billing_details.name`. Often not the payer, so never assumed to be. */
  cardholder: string | null;
  email: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  };
  exp_month: number | null;
  exp_year: number | null;
  /** Pre-formatted MM/YY, null for a wallet. */
  expiry: string | null;
  /** Stripe's own classification: "credit" / "debit" / "prepaid". Not a guess from brand. */
  funding: string | null;
  /** `card.wallet.type` — "apple_pay", "google_pay", "link"… null for a typed-in card. */
  wallet: string | null;
  /** The same, spelled the way it is written: "Apple Pay". */
  wallet_label: string | null;
  /**
   * Where the card was ISSUED (2-letter), falling back to the billing address country
   * for a wallet that has no card behind it.
   *
   * Not the address the payer typed, and it will disagree with it — a US-issued card
   * billed to Manila is ordinary, and Stripe's 4242 test card is always US. The issuer is
   * what drives cross-border fees and declines, and the billing address is already in the
   * Edit dialog.
   */
  country: string | null;
  /** Resolved against Minty's country registry; falls back to the code. */
  country_name: string | null;
  is_default: boolean;
  /** The expiry month has passed. A card is good through the LAST day of that month. */
  expired: boolean;
  /** Expires within two months — while a replacement can still be saved in time. */
  expires_soon: boolean;
  added: string | null;
  added_iso: string | null;
};

export type PayerPaymentMethods = {
  /**
   * False means no Stripe customer at all, which is not an empty wallet: an account whose
   * trials never captured a card has never opened one. "Add payment method" is the only
   * thing to show there.
   */
  has_account: boolean;
  default_id: string | null;
  methods: SavedPaymentMethod[];
  total: number;
};

export type SetupIntentHandle = {
  /** Authorises the browser to confirm THIS intent and nothing else. */
  client_secret: string;
  publishable_key: string;
  setup_intent: string;
};

/**
 * POST to a payer-portal endpoint with the token handling, and give back the payload.
 *
 * The mutating half of `portalGet`, and it exists for the same reason: the billing JWT
 * lives 30 minutes inside a cookie that lives 8 hours, so a tab left open holds a token
 * Minty will reject. Refresh up front, and retry once behind a refresh.
 *
 * A refusal from these endpoints is WRITTEN FOR THE CUSTOMER — "make another one the
 * default first", "that expiry date has already passed" — so its message passes through
 * untouched rather than being flattened into a generic failure. The `^[a-z_]+$` test is
 * what tells a sentence from a machine code like `unauthorized`.
 */
async function portalPost<T>(path: string, body: unknown): Promise<T> {
  const auth = getAuth();
  if (!auth?.token) throw new PortalError(401, MESSAGES[401]);

  let token = auth.token;
  if (isTokenExpiringSoon() && (await refreshToken())) {
    token = getAuth()?.token ?? token;
  }

  const url = `${mintyOrigin()}${path}`;
  const send = (bearer: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });

  let res: Response;
  try {
    res = await send(token);
  } catch {
    throw new PortalError(0, "I couldn't reach the server just now. Let's try again?");
  }

  if (res.status === 401 && (await refreshToken())) {
    const fresh = getAuth()?.token;
    if (fresh) res = await send(fresh);
  }

  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!res.ok) {
    throw new PortalError(
      res.status,
      payload?.error && !/^[a-z_]+$/.test(payload.error)
        ? payload.error
        : MESSAGES[res.status] ?? "Something got stuck on my end! Let's try again?",
    );
  }
  return payload as T;
}

/** Every payment method saved on the signed-in payer's account, default first. */
export async function fetchPaymentMethods(
  signal?: AbortSignal,
): Promise<PayerPaymentMethods> {
  const data = await portalGet<PayerPaymentMethods>(
    "/api/me/billing/payment-methods",
    new URLSearchParams(),
    signal,
  );
  if (!data || !Array.isArray(data.methods)) {
    throw new PortalError(502, "That came back in a shape I didn't expect. Let's try again?");
  }
  return data;
}

/**
 * Open a SetupIntent for the in-app card form.
 *
 * The card is typed into Stripe Elements and confirmed straight against Stripe — it never
 * reaches Minty, which is what keeps the app out of PCI scope even though the UI is ours.
 * No customer is created here: a form that gets abandoned must leave nothing behind.
 */
export async function startCardSetup(): Promise<SetupIntentHandle> {
  const data = await portalPost<SetupIntentHandle>(
    "/api/me/billing/payment-methods/setup-intent",
    {},
  );
  if (!data?.client_secret || !data?.publishable_key) {
    throw new PortalError(502, "The card form didn't open. Let's try again?");
  }
  return data;
}

/**
 * Tell Minty about the card Stripe just confirmed, and get the refreshed list back.
 *
 * MUST be awaited before the list is re-read. Until this resolves the method may not be
 * attached to any customer at all — for a payer's first card there is no customer yet
 * either, and this is what creates it.
 */
export async function confirmCardSetup(
  setupIntent: string,
  makeDefault = false,
): Promise<PayerPaymentMethods> {
  return portalPost<PayerPaymentMethods>(
    "/api/me/billing/payment-methods/confirm",
    { setup_intent: setupIntent, make_default: makeDefault },
  );
}

/** Nominate the method every future invoice is charged to — account-wide. */
export async function setDefaultPaymentMethod(
  paymentMethod: string,
): Promise<PayerPaymentMethods> {
  return portalPost<PayerPaymentMethods>(
    "/api/me/billing/payment-methods/default",
    { payment_method: paymentMethod },
  );
}

/**
 * Correct a saved method's expiry or billing details.
 *
 * Deliberately not a way to change the card: Stripe does not allow a number, brand or CVC
 * to be edited, because a different card is a different PaymentMethod. Replacing one is
 * "Add payment method" followed by removing the old.
 */
export async function updatePaymentMethod(
  paymentMethod: string,
  changes: {
    exp_month?: number;
    exp_year?: number;
    name?: string;
    address?: Partial<SavedPaymentMethod["address"]>;
  },
): Promise<PayerPaymentMethods> {
  return portalPost<PayerPaymentMethods>(
    "/api/me/billing/payment-methods/update",
    { payment_method: paymentMethod, ...changes },
  );
}

/**
 * Detach a saved method.
 *
 * Two 409s carry a stated reason and are shown as written: the default cannot go while
 * another method could take its place, and the last method cannot go at all while
 * something is still billing to it.
 */
export async function removePaymentMethod(
  paymentMethod: string,
): Promise<PayerPaymentMethods> {
  return portalPost<PayerPaymentMethods>(
    "/api/me/billing/payment-methods/remove",
    { payment_method: paymentMethod },
  );
}

// --- Invoices ---------------------------------------------------------------

export type InvoiceRow = {
  id: string;
  /** The processor's id where there is one; a short local id when nothing was ever sent. */
  reference: string;
  date: string | null;
  date_iso: string | null;
  period_start: string | null;
  period_end: string | null;
  /**
   * WHAT HAPPENED, then the plans it happened to — "Upgrade · Petty Cash → Super Minty",
   * "Renewal · Petty Cash", "New subscription · Payment Request", "Access extension ·
   * Petty Cash".
   *
   * The plan name on its own answered a question the customer had not asked: it could
   * not tell a renewal from an upgrade from the charge raised when something was
   * cancelled, so three invoices in one month all read "Petty Cash".
   */
  description: string;
  /** The period and the company — "6 Aug – 6 Sep 2026 · 4 entities · 1 access extension". */
  description_detail: string;
  /**
   * The sentence the biller wrote when it knew the figures, e.g. "Unused Petty Cash
   * credited 149.33; Super Minty charged 213.33 for the same days. Net 64.00." The only
   * place the arithmetic behind a prorated amount is written down — too long for the
   * cell, so it rides along as the row's title. Null on invoices raised before the
   * column was populated.
   */
  memo: string | null;
  /** Formatted with its own currency symbol, e.g. "HK$400.00". */
  amount: string;
  amount_minor: number;
  currency: string;
  /** Stripe's vocabulary: paid / open / draft / uncollectible / void. */
  status: string;
  status_label: string;
  /**
   * The card that actually paid, snapshotted at settle time — never the account's
   * current default, which is a different card the moment anyone updates one. Null for
   * invoices raised before the column existed; the column says "Not recorded" rather
   * than naming a card that may not be the one charged.
   */
  payment_method: string | null;
  /**
   * Stripe's hosted invoice page — carries the PDF download and, while the invoice is
   * open, a way to pay it. Null until finalized, so the row's action stays disabled
   * rather than pointing at nothing.
   *
   * A CAPABILITY URL: its token is the authorisation, so it opens with
   * `rel="noopener noreferrer"` and is never logged.
   */
  hosted_invoice_url: string | null;
  entities: string[];
};

export type PayerInvoices = {
  invoices: InvoiceRow[];
  /** Built from invoice HISTORY, so a company you stopped paying for is still listed. */
  entity_options: { id: string; name: string }[];
  entity_id: string | null;
  total: number;
  page: number;
  pages: number;
  per_page: number;
};

export type PayerInvoicesParams = {
  entityId?: string | null;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

/** The signed-in user's invoices, newest first, optionally narrowed to one entity. */
export async function fetchPayerInvoices(
  params: PayerInvoicesParams = {},
): Promise<PayerInvoices> {
  const search = new URLSearchParams();
  if (params.entityId) search.set("entity", params.entityId);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("per_page", String(params.perPage));

  const data = await portalGet<PayerInvoices>(
    "/api/me/invoices",
    search,
    params.signal,
  );
  if (!data || !Array.isArray(data.invoices)) {
    throw new PortalError(502, "That came back in a shape I didn't expect. Let's try again?");
  }
  return data;
}

// --- Change subscriber (write) -----------------------------------------------
//
// One-liners over `portalPost`, deliberately. It already carries the whole contract these
// need — refresh-then-retry on a stale token, and a 422's stated reason passed through
// untouched instead of flattened into generic copy — and `inviteAdminToEntity` above is
// forty hand-rolled lines that re-derive exactly that. Do not copy it.

/** Offer this company's subscription to another admin. */
export async function initiateTransfer(
  entityId: string,
  toUserId: string,
): Promise<string> {
  const data = await portalPost<{ message?: string }>(
    "/api/me/subscriptions/transfer",
    { entity: entityId, to_user: toUserId },
  );
  return data?.message || "The handover request has been sent.";
}

/**
 * Accept or decline a handover offered to you.
 *
 * Accepting TAKES A PAYMENT, so this is the one call on this screen that moves money.
 * Safe to retry: Minty adopts an invoice already paid under the offer's key rather than
 * raising a second one, so a double-click or a timeout costs nothing.
 */
export async function respondToTransfer(
  transferId: string,
  accept: boolean,
): Promise<string> {
  const data = await portalPost<{ message?: string }>(
    "/api/me/subscriptions/transfer/respond",
    { transfer: transferId, accept },
  );
  return data?.message || (accept ? "You're now the subscriber." : "Request declined.");
}

/** Withdraw an offer you made. */
export async function cancelTransfer(transferId: string): Promise<string> {
  const data = await portalPost<{ message?: string }>(
    "/api/me/subscriptions/transfer/cancel",
    { transfer: transferId },
  );
  return data?.message || "The handover request has been withdrawn.";
}

/**
 * Handovers waiting for the signed-in user to answer.
 *
 * Scoped by the TOKEN, not by anything in the request — it returns companies the caller
 * does not pay for, which is the whole point, so it cannot be narrowed client-side.
 */
export async function listIncomingTransfers(
  signal?: AbortSignal,
): Promise<IncomingTransfer[]> {
  const data = await portalGet<{ transfers?: IncomingTransfer[] }>(
    "/api/me/subscriptions/transfers",
    new URLSearchParams(),
    signal,
  );
  return Array.isArray(data?.transfers) ? data.transfers : [];
}
