import type { ModuleStatus } from "@/lib/payerPortal";

/**
 * The status pill, and the one place the seven statuses are given colour.
 *
 * Four come from the design. The other three are splits it does not draw, and folding
 * them into the greys would each cost a true statement:
 *
 *   past_due      — live, and money is owed. Green would say "fine"; grey would say
 *                   "gone". It is the only row on the screen that needs acting on today,
 *                   so it is the only one in red.
 *   ended         — this entity PAID and it ran out.
 *   trial_expired — free days ran out; nothing was ever charged.
 *
 * The last three share one grey, because they are the same fact visually — nothing is
 * live here. What they must not share is the WORDS: "not subscribed" denies a purchase,
 * and "trial expired" denies it twice over.
 */
const DORMANT = "bg-[#F2F5F7] text-[#949CA6]";

const STYLES: Record<ModuleStatus, string> = {
  active: "bg-[#D6EDD9] text-[#267347]",
  trialing: "bg-[#DBE8FC] text-[#2961AD]",
  cancelled: "bg-[#FCE6BD] text-[#9E690D]",
  past_due: "bg-[#FDE2E2] text-[#B42318]",
  ended: DORMANT,
  trial_expired: DORMANT,
  not_subscribed: DORMANT,
};

/** Whether the module NAME beside this badge should read as inactive too. */
export function isDormant(status: ModuleStatus): boolean {
  return (
    status === "not_subscribed" || status === "ended" || status === "trial_expired"
  );
}

export function SubscriptionStatusBadge({
  status,
  label,
}: {
  status: ModuleStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[12.5px] font-semibold leading-[15px] ${STYLES[status] ?? STYLES.not_subscribed}`}
    >
      {label}
    </span>
  );
}
