"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  inviteAdminToEntity,
  fetchSubscriberOptions,
  PortalError,
  type SubscriberOptions,
} from "@/lib/payerPortal";

/**
 * "Change subscriber" — the screen behind that item on the subscriptions row menu.
 *
 * READ ONLY, deliberately and completely. Both actions render disabled and neither is a
 * styling decision:
 *
 * 1. HANDING OVER THE BILL HAS NO ROUTE. `payer_user_id` sits on every module row, the
 *    billing account, the invoices and the audit log, and one-payer-per-entity is an
 *    invariant `upsert_module_row` enforces. Moving it is not an UPDATE — it is a
 *    question about the period already paid for, the anchor the new payer bills on and
 *    whose card renews it, and none of those have answers yet.
 *
 * 2. INVITING SOMEONE IS NOT THIS SCREEN'S JOB EITHER. Minty's invite flow
 *    (`POST /minty/api/invitation/send`) takes a role and lands the person in the entity,
 *    which is a membership change made from the Settings user list. A second door to it
 *    here — one that then cannot do the thing the user came for — would be worse than
 *    the greyed button.
 *
 * The list itself is real: the Settings user list narrowed to admins, from the same
 * `user_entity` table with the same approved-only filter, because the bill can only sit
 * with someone who could act on it.
 */

const SECTION = "text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9AA3AE]";

const UNAVAILABLE_CHANGE =
  "Handing an entity to a different payer isn't wired up yet — the period already paid for, the billing anchor and the card all move with it.";
/**
 * The invite is LIVE; changing the subscriber is not. They look adjacent on this screen
 * and are not the same act: inviting adds a member to the company, which is reversible
 * and moves no money. Handing over the bill has to survive the period already paid for.
 */

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
          : "That invitation didn't send. Let's try again?",
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
    if (!entityId) return;
    const controller = new AbortController();
    // No `setLoading(true)` to open with: it already starts true whenever there is an
    // entity to load, and this runs once — the entity comes from the URL and does not
    // change under the page.
    fetchSubscriberOptions(entityId, controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
        // Nothing pre-selected. The current payer is a row like any other here, and
        // starting with them ticked would make "no change" look like a choice made.
        setSelected(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof PortalError
            ? err.message
            : "Hmm, that didn't come through. Let's give it another go?",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [entityId]);

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

          {/* The candidates ---------------------------------------------------- */}
          <p className={`mt-6 ${SECTION}`}>
            Select new subscriber for this entity{" "}
            <span className="normal-case tracking-normal text-[#6B7380]">
              (Admin role only)
            </span>
          </p>

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
          </>
        )}

        {/* Actions ----------------------------------------------------------- */}
        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/profile/subscriptions"
            className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#D8DEE4] bg-white px-6 py-3 text-[15px] font-semibold text-[#292E38] transition-colors hover:bg-[#F5F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled
            title={UNAVAILABLE_CHANGE}
            className="inline-flex cursor-not-allowed items-center justify-center rounded-[10px] bg-secondary/40 px-6 py-3 text-[15px] font-semibold text-white"
          >
            Change subscriber
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-[52rem] text-xs leading-relaxed text-[#6B7380]">
        Read-only for now. The list is real — these are this company&rsquo;s admins — but
        moving the bill to one of them is switched off until the handover has somewhere to
        record what happens to the period already paid for.
      </p>
    </div>
  );
}
