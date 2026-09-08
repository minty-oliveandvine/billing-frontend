"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  cancelTransfer,
  initiateTransfer,
  inviteAdminToEntity,
  fetchSubscriberOptions,
  PortalError,
  type SubscriberOptions,
} from "@/lib/payerPortal";
import { day, money } from "@/lib/payerPortalFormat";

import { InheritedTrials } from "./InheritedTrials";

/**
 * "Change subscriber" — the screen behind that item on the subscriptions row menu.
 *
 * It OFFERS the handover; it does not perform one. Picking someone here sends them a
 * request, and nothing about the company changes until they accept — at which point
 * Minty charges THEM for the days the current payer's money does not cover, and the
 * subscription moves. That asymmetry is the whole design: the bill can only be handed to
 * someone who agrees to pay it, so one side proposes and the other consents.
 *
 * Two things arrive from the server rather than being decided here, and both matter:
 *
 * 1. `blockers` — why the handover cannot go ahead, in Minty's own words. A trial still
 *    running, a debt outstanding, an unbilled cancellation charge. Shown BEFORE the click,
 *    because the alternative is learning it by being refused.
 * 2. `quote` — what the incoming payer will actually be charged, priced by the same
 *    function that takes the money, so the figure shown and the figure charged cannot
 *    disagree.
 *
 * The candidate list is the Settings user list narrowed to admins whose ACCOUNT is also
 * live — an offer to a deactivated admin can never be accepted, and it would freeze the
 * current payer's own exit behind an inbox nobody can open.
 */

const SECTION = "text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9AA3AE]";

function Initials({ name, email }: { name: string; email: string }) {
  const source = (name || email || "?").trim();
  const letters = name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
    : source.slice(0, 2);
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFF3F6] text-[13px] font-semibold uppercase text-[#6B7380]"
    >
      {letters}
    </span>
  );
}

export function ChangeSubscriberContent({ entityId }: { entityId?: string }) {
  const [data, setData] = useState<SubscriberOptions | null>(null);
  const [loading, setLoading] = useState(Boolean(entityId));
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [invite, setInvite] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const pending = data?.pending_transfer ?? null;
  const blockers = data?.blockers ?? [];
  // The price follows the SELECTION, because it is a fact about the person accepting —
  // their billing anchor decides where the charged window ends.
  const chosen = data?.candidates.find((c) => c.id === selected);
  const quote = chosen?.quote ?? null;
  // Follows the selection like the price does — the conversion is charged against the
  // chosen person's own cycle, so the figure is theirs.
  const trials = chosen?.trials ?? [];

  /**
   * Re-read the screen from the server.
   *
   * Called after every successful write, and that is not a refinement — without it the
   * page cannot show what just happened. Sending a request creates a pending offer, which
   * changes this screen from "pick someone" to "a request is waiting, withdraw it?"; that
   * state lives in `pending_transfer`, which only arrives in a fetch. Leaving the stale
   * payload in place left a success message above a Send button that was now disabled
   * (nothing selected) with no pending banner — the write had worked and the screen said
   * nothing about it.
   *
   * Re-reading rather than patching the payload locally, for the same reason the incoming
   * list does: the server also recomputes `blockers` and the quote, and what it says is
   * now true is worth more than what this component can infer.
   */
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!entityId) return;
      try {
        const result = await fetchSubscriberOptions(entityId, signal);
        setData(result);
        setError(null);
        // Nothing pre-selected. The current payer is a row like any other here, and
        // starting with them ticked would make "no change" look like a choice made.
        setSelected(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "That didn't come through. Mind trying again?",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [entityId],
  );

  const send = async () => {
    if (!entityId || !selected) return;
    setSending(true);
    setSendError(null);
    try {
      setSent(await initiateTransfer(entityId, selected));
      await load();
    } catch (e) {
      // A 422 is a stated reason — "that person needs a saved payment method" — and it
      // arrives already worded for the person who clicked.
      setSendError(
        e instanceof PortalError
          ? e.message
          : "That request didn't send. Mind trying again?",
      );
    } finally {
      setSending(false);
    }
  };

  const withdraw = async () => {
    if (!pending) return;
    setSending(true);
    setSendError(null);
    try {
      setSent(await cancelTransfer(pending.id));
      await load();
    } catch (e) {
      setSendError(
        e instanceof PortalError ? e.message : "That didn't go through. Mind trying again?",
      );
    } finally {
      setSending(false);
    }
  };

  const sendInvite = async () => {
    if (!entityId || !invite.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInvited(null);
    try {
      setInvited(await inviteAdminToEntity(entityId, invite.trim()));
      // Cleared only on success, so a rejected address stays in the box to be corrected.
      setInvite("");
    } catch (e) {
      setInviteError(
        e instanceof PortalError
          ? e.message
          : "That invitation didn't send. Mind trying again?",
      );
    } finally {
      setInviting(false);
    }
  };

  // Reached without an entity — someone typed the URL, or a link lost its query string.
  // DERIVED rather than pushed into state from the effect below: it is a fact about the
  // props, and setting it would be a render that says what this line already says.
  const problem = entityId
    ? error
    : "No company was picked. Open this from a row on Manage Subscriptions.";

  useEffect(() => {
    const controller = new AbortController();
    // No `setLoading(true)` to open with: it already starts true whenever there is an
    // entity to load, and this runs once — the entity comes from the URL and does not
    // change under the page.
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="w-full max-w-[62rem]">
      <div className="rounded-2xl border border-[#E6EBED] bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.05)] sm:p-7">
        {problem ? (
          /* Nothing below it is worth drawing: without the payload the banner has no
             company to name and the list has nobody to offer, so an empty one would read
             as "this company has no admins" rather than "this didn't load". */
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
            role="alert"
          >
            {problem}
          </div>
        ) : (
          <>
          {/* The entity, and who is being billed for it today ------------------ */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#E9F7F6] px-5 py-4">
            <div className="min-w-0">
              <p className="break-words text-[15px] font-bold text-[#21262E]">
                {loading ? "Loading…" : (data?.entity.entity_name ?? "—")}
              </p>
              <p className="mt-1 break-words text-sm text-[#6B7380]">
                {data
                  ? `Currently billed to ${data.current.name || data.current.email}`
                  : " "}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#2E9B9B]">Entity</span>
          </div>

          {/* Why it can't go ahead, if it can't ------------------------------- */}
          {/* Minty's own sentences. Shown here rather than on the click, because "this
              company has a module still on trial" is something to know before choosing a
              person, not after being refused. */}
          {blockers.length > 0 ? (
            <div
              className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {blockers.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          ) : null}

          {/* An offer already waiting ---------------------------------------- */}
          {pending ? (
            <div
              className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary"
              role="status"
            >
              <p className="font-semibold">A request is already waiting.</p>
              <p className="mt-1">
                Sent {day(pending.since)}. They haven&rsquo;t answered yet, and nothing has
                changed. Withdraw it below if you&rsquo;d rather ask someone else.
              </p>
            </div>
          ) : null}

          {/* The candidates ---------------------------------------------------- */}
          <p className={`mt-6 ${SECTION}`}>
            Select new subscriber for this entity{" "}
            <span className="normal-case tracking-normal text-[#6B7380]">
              (Admin role only)
            </span>
          </p>

          {/* What they'll be charged. Priced by the same function that takes the money,
              so this figure and the invoice cannot disagree. */}
          {quote && !pending ? (
            <p className="mt-2 text-sm text-[#6B7380]">
              They&rsquo;ll be charged{" "}
              <span className="font-semibold text-[#21262E]">
                {money(quote.amount, quote.currency)}
              </span>{" "}
              for {day(quote.covers_from)} to {day(quote.covers_to)} — the days after the
              period you&rsquo;ve paid for, up to their own billing date.
              {quote.anchor_is_new
                ? " This also sets that billing date."
                : ""}
            </p>
          ) : null}

          {/* Free days they would inherit, and the charge that follows them. Beside the
              price rather than below the list, because both answer the same question:
              what does picking this person actually commit them to. */}
          {!pending ? <InheritedTrials trials={trials} voice="they" /> : null}

          <div className="mt-4 flex flex-col gap-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[68px] animate-pulse rounded-xl border border-[#E6EBED] bg-[#F7F9FA]"
                />
              ))
            ) : (data?.candidates.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed border-[#E6EBED] px-5 py-8 text-center text-sm text-[#6B7380]">
                Nobody on this company is an admin. Someone has to be an admin here before
                the bill can sit with them.
              </p>
            ) : (
              data?.candidates.map((person) => {
                const active = selected === person.id;
                return (
                  <label
                    key={person.id}
                    className={`flex cursor-pointer items-center gap-3.5 rounded-xl border px-4 py-3.5 transition-colors ${
                      active
                        ? "border-[#2E9B9B] bg-[#F0FAF9]"
                        : "border-[#E6EBED] bg-white hover:bg-[#F7F9FA]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="subscriber"
                      value={person.id}
                      checked={active}
                      onChange={() => setSelected(person.id)}
                      className="h-[18px] w-[18px] shrink-0 accent-[#2E9B9B]"
                    />
                    <Initials name={person.name} email={person.email} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-semibold text-[#21262E]">
                        {person.name || person.email}
                      </span>
                      <span className="block break-all text-sm text-[#6B7380]">
                        {person.email || "No email on file"}
                      </span>
                    </span>
                    {person.is_current ? (
                      <span className="shrink-0 rounded-md bg-[#EFF1F4] px-2.5 py-1 text-xs font-semibold text-[#6B7380]">
                        Current
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          {/* Invite ------------------------------------------------------------ */}
          <hr className="my-7 border-[#EEF1F4]" />

          <label htmlFor="inviteEmail" className="block text-sm font-semibold text-[#374151]">
            Invite someone new
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white pr-2 focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
            <input
              id="inviteEmail"
              type="email"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="name@company.com"
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-[#16202E] placeholder:text-[#9CA3AF] focus:outline-none"
            />
            <button
              type="button"
              onClick={sendInvite}
              disabled={inviting || !invite.trim()}
              className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[15px] font-semibold text-secondary transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-[#B4BAC3]"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>

          {/* The server's own words. A 422 here is a stated reason — already a member,
              already invited — not a failure to paper over. */}
          {inviteError ? (
            <p className="mt-2 text-sm text-[#B42318]" role="alert">
              {inviteError}
            </p>
          ) : null}
          {invited ? (
            <p className="mt-2 text-sm text-[#267347]" role="status">
              {invited}
            </p>
          ) : null}

          {/* Actions --------------------------------------------------------- */}
          {/* INSIDE the success branch. Rendered outside it, the button went live on a
              screen that had failed to load — offering to hand over a company whose name
              could not even be fetched. */}
          <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/profile/subscriptions"
              className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-6 py-3 text-[15px] font-semibold text-[#292E38] transition-colors hover:bg-[#F5F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {pending ? "Back" : "Cancel"}
            </Link>
            {pending ? (
              <button
                type="button"
                onClick={withdraw}
                disabled={sending}
                className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-6 py-3 text-[15px] font-semibold text-[#B42318] transition-colors hover:bg-[#FEF3F2] disabled:cursor-not-allowed disabled:text-[#B4BAC3]"
              >
                {sending ? "Withdrawing…" : "Withdraw request"}
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={
                  sending || !selected || selected === data?.current.id ||
                  blockers.length > 0
                }
                className="inline-flex items-center justify-center rounded-[10px] bg-secondary px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary/40"
              >
                {sending ? "Sending…" : "Send request"}
              </button>
            )}
          </div>

          {sendError ? (
            <p className="mt-3 text-right text-sm text-[#B42318]" role="alert">
              {sendError}
            </p>
          ) : null}
          {sent ? (
            <p className="mt-3 text-right text-sm text-[#267347]" role="status">
              {sent}
            </p>
          ) : null}
          </>
        )}
      </div>

      <p className="mt-4 max-w-[52rem] text-xs leading-relaxed text-[#6B7380]">
        Nothing changes until they accept. When they do, they&rsquo;re charged for the days
        after the period you&rsquo;ve already paid for, and the subscription moves to their
        billing account &mdash; your existing invoices stay on yours.
      </p>
    </div>
  );
}
