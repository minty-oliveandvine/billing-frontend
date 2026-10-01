"use client";

// COPY of minty-web/features/subscription/components/InterruptedDialogs.tsx (2026-10-01) - lifted into @minty/shared at Part 3 step 4;
// change all three (minty-web, here, Flask's port: Minty static/js/minty_dialog.js + static/css/minty_dialog.css).
// Only `LeaveDialog` is copied: Payment Settings' "Leave without saving?" (lib/leaveGuard.ts).

/**
 * When it gets interrupted (Figma section 06·B), on the `ConfirmDialog` shell:
 *
 * - `LeaveDialog` (A-11, "Leaving with changes not confirmed"): "Leave without saving?" when
 *   the open row has ticks pending and the person closes it, opens another company, or goes
 *   back - "Discard changes" drops the ticks and goes, "Go Back" stays.
 */

import { ConfirmDialog } from "@/features/subscription/components/ConfirmDialog";

export const LEAVE_TITLE = "Leave without saving?";
export const LEAVE_BODY_1 = "You have unsaved changes.";
export const LEAVE_BODY_2 = "Your changes will be lost if you leave this page.";
export const DISCARD_CHANGES = "Discard changes";
export const GO_BACK_UPPER = "Go Back";

export function LeaveDialog({ onDiscard, onStay }: { onDiscard: () => void; onStay: () => void }) {
  return (
    <ConfirmDialog
      title={<span data-modal="leave">{LEAVE_TITLE}</span>}
      image="dont"
      busy={false}
      confirmLabel={GO_BACK_UPPER}
      confirmTone="teal"
      backLabel={DISCARD_CHANGES}
      backTone="teal"
      onConfirm={onStay}
      onBack={onDiscard}
      onDismiss={onStay}
    >
      <p>{LEAVE_BODY_1}</p>
      <p>{LEAVE_BODY_2}</p>
    </ConfirmDialog>
  );
}
