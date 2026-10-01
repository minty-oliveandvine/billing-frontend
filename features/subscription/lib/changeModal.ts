// COPY of minty-web/features/subscription/lib/changeModal.ts (2026-10-01) - lifted into @minty/shared at Part 3 step 4;
// change all three (minty-web, here, Flask's port: Minty static/js/minty_dialog.js + static/css/minty_dialog.css).
// Only the two types the copied dialogs read (ConfirmDialog.tsx): the modal logic stays in minty-web.

/** The Minty in the dialog's corner - trimmed to the one image this app ships. */
export type ModalImage = "dont";

export type ConfirmTone = "teal" | "orange" | "red";
