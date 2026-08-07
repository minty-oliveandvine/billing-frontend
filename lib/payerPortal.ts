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
};

export type SubscriberOptions = {
  entity: { entity_id: string; entity_name: string };
  current: { id: string; name: string; email: string };
  candidates: SubscriberCandidate[];
};

// --- Billing ----------------------------------------------------------------

/**
 * ONE account, several entities — the shape of the Billing tab, and not a simplification.
 * Minty holds a single `user_stripe_customer` per payer: one currency, one anchor, one
 * dunning clock, one card on one Stripe customer. The renewal issues a single invoice per
 * payer with a line per entity, and `issue_invoice` charges the CUSTOMER — so there is
 * exactly one card in play however many companies are on the bill.
 */
export type BillingStatus = "active" | "past_due" | "trial" | "none";

export type BillingCard = {
  /** "card", or a wallet type such as "link". */
  type: string;
  brand: string | null;
  last4: string | null;
  /** Stripe's `billing_details.name` — often not the payer, so never assumed to be. */
  cardholder: string | null;
  /** Pre-formatted MM/YY, null for a wallet that exposes no card. */
  expiry: string | null;
  /** The complete string to print — "Visa •••• 4242", or "Link". */
  label: string;
};

export type BillingEntity = {
  entity_id: string;
  entity_name: string;
  country: string | null;
  country_code: string | null;
  /** Plan display name — "Super Minty" / "Petty Cash" / "Payment Request", or null. */
  plan: string | null;
  plan_code: string | null;
  status: BillingStatus;
  status_label: string;
  settings_path: string;
};

export type PayerBilling = {
  account: {
    has_account: boolean;
    name: string;
    email: string;
    currency: string | null;
    anchor: string | null;
    next_billing: string | null;
    next_billing_iso: string | null;
    card: BillingCard | null;
    status: BillingStatus;
    status_label: string;
  };
  entities: BillingEntity[];
  total: number;
};

/**
 * Dropdown contents for the billing-account form, from Minty's registries.
 *
 * Fetched rather than typed into the client: `country_info` and `currency_info` hold the
 * full ISO lists narrowed by `is_active` to what this deployment operates in, and
 * `billing_plan` is the price catalog. A hardcoded list would drift from all three, and
 * would offer a country or a plan that cannot actually be billed.
 */
export type BillingFormOptions = {
  countries: { code: string; name: string }[];
  currencies: { code: string; name: string }[];
  plans: { code: string; name: string; currency: string }[];
  statuses: { value: BillingStatus; label: string }[];
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

/** The signed-in user's billing account, and what each entity puts on it. */
export async function fetchPayerBilling(signal?: AbortSignal): Promise<PayerBilling> {
  const data = await portalGet<PayerBilling>(
    "/api/me/billing",
    new URLSearchParams(),
    signal,
  );
  if (!data?.account || !Array.isArray(data.entities)) {
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

/**
 * Opens Stripe's payment-method form and returns the URL to send the browser to.
 *
 * The card is captured by STRIPE, never by this app — no PAN or CVC passes through here,
 * which is what keeps the application out of PCI scope. `next` is a path on this origin
 * to return to once the card is saved.
 *
 * A 409 means the account has no Stripe customer yet: the portal cannot create one, so
 * the first card has to come through an entity's subscribe flow. Callers should say that
 * rather than showing a bare failure.
 */
export async function startPaymentMethodUpdate(next: string): Promise<string> {
  const auth = getAuth();
  if (!auth?.token) throw new PortalError(401, MESSAGES[401]);

  let token = auth.token;
  if (isTokenExpiringSoon() && (await refreshToken())) {
    token = getAuth()?.token ?? token;
  }

  const url = `${mintyOrigin()}/api/me/billing/payment-method`;
  const send = (bearer: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ next }),
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
    | { url?: string; error?: string }
    | null;

  if (!res.ok || !body?.url) {
    throw new PortalError(
      res.status,
      body?.error && !/^[a-z_]+$/.test(body.error)
        ? body.error
        : MESSAGES[res.status] ?? "Could not open the payment form. Let's try again?",
    );
  }
  return body.url;
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

/** Countries, currencies, plans and statuses for the billing-account form. */
export async function fetchBillingFormOptions(
  signal?: AbortSignal,
): Promise<BillingFormOptions> {
  const data = await portalGet<BillingFormOptions>(
    "/api/me/billing/options",
    new URLSearchParams(),
    signal,
  );
  if (!data || !Array.isArray(data.countries)) {
    throw new PortalError(502, "That came back in a shape I didn't expect. Let's try again?");
  }
  return data;
}
