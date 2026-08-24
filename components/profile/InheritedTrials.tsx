import { Fragment, type ReactNode } from "react";

import type { InheritedTrial } from "@/lib/payerPortal";
import { day, money } from "@/lib/payerPortalFormat";

/**
 * Trials the incoming payer takes on. Free now, charged on their card at the date shown.
 *
 * Stated before the button, because "Accept and pay" is only honest if the part that is
 * paid LATER is named too — otherwise the first they hear of it is the bank line.
 *
 * `voice` exists because the SAME facts are read by two different people. On the accept
 * screen the reader is the one who will pay, so it is "you". On Change subscriber the
 * reader is the current payer choosing somebody else, and "you'll be charged" tells them
 * the opposite of what happens — they are handing the bill away, not picking it up.
 *
 * Shared by both screens rather than copied into each, which is what it used to be. The
 * two sides quote the same handover and must not word it differently.
 *
 * Everything is said ONCE. The earlier version repeated "X is on a free trial until D.
 * They'll be charged A then." per row, so a company with two conversion dates got a box
 * that was mostly the same sentence twice. The modules are named together, then the
 * charges are listed together in the same order.
 *
 * `framed` is layout, not content. On Change subscriber this stands alone and needs its
 * own box. On the accept screen it belongs INSIDE the money panel — what is paid today
 * and what is paid later are one answer to one question, and two stacked grey boxes
 * saying "free trial" in both made it look like two separate findings.
 */
export function InheritedTrials({
  trials,
  voice = "you",
  framed = true,
}: {
  trials: InheritedTrial[];
  voice?: "you" | "they";
  framed?: boolean;
}) {
  if (!trials.length) return null;

  // True when the person reading this is the one who will be charged.
  const readerPays = voice === "you";
  const subject = readerPays ? "You’ll" : "They’ll";
  const possessive = readerPays ? "your" : "their";

  /**
   * The verb follows what is NAMED, not how many modules are behind the name.
   *
   * A row is one per conversion DATE, not per module, so a single row can cover several
   * modules — but the server labels it either with the plan's own name ("Super Minty",
   * one thing) or with a phrase listing the modules ("Petty Cash and Payment Request",
   * several). Counting `codes` cannot tell those apart and gets the bundle wrong:
   * "Super Minty are on a free trial". The label itself can, because the phrase form is
   * the only one that joins names with "and".
   */
  const plural =
    trials.length > 1 || (trials[0]?.label ?? "").includes(" and ");

  // Null amount means pricing raised server-side. The trial is still disclosed, just
  // without a figure — silence would be the one unacceptable answer.
  const priced = trials.filter(
    (trial): trial is InheritedTrial & { amount: number } => trial.amount != null,
  );
  const unpriced = trials.length - priced.length;
  const setsAnchor = trials.some((trial) => trial.anchor_is_new);

  const labels = list(
    trials.map((trial) => (
      <span key={rowKey(trial)} className="font-semibold">
        {trial.label}
      </span>
    )),
  );

  const charges = list(
    priced.map((trial) => (
      <Fragment key={rowKey(trial)}>
        <span className="font-semibold">{money(trial.amount, trial.currency)}</span> on{" "}
        <span className="font-semibold">{day(trial.trial_end)}</span>
      </Fragment>
    )),
  );

  const body = (
    <p className={framed ? undefined : "mt-1 text-primary"}>
      {labels} {plural ? "are" : "is"} on a free trial.{" "}
      {priced.length ? (
        <>
          {subject} be charged {charges}
          {setsAnchor
            ? `, and ${
                priced.length === 1 ? "that sets" : "the first of those sets"
              } ${possessive} monthly billing date`
            : ""}
          .{" "}
        </>
      ) : null}
      {unpriced
        ? priced.length
          ? "The rest carries over with the company."
          : plural
            ? "The trials carry over with the company."
            : "The trial carries over with the company."
        : null}
    </p>
  );

  if (!framed) return body;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary">
      {body}
    </div>
  );
}

/** Rows are one per conversion date, so the date plus its modules identifies one. */
function rowKey(trial: InheritedTrial) {
  return `${trial.trial_end}-${trial.codes.join()}`;
}

/** "A", then "A and B", then "A, B and C". */
function list(items: ReactNode[]) {
  return items.map((item, i) => (
    <Fragment key={i}>
      {i === 0 ? "" : i === items.length - 1 ? " and " : ", "}
      {item}
    </Fragment>
  ));
}
