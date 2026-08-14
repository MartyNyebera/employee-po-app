import type React from 'react';

// ============================================================================
// Shared modal-backdrop dismissal.
//
// Bug this fixes: a modal backdrop wired as `onClick={onClose}` also closes when a drag that
// STARTS inside the modal (e.g. selecting text in an input, or a slider) and RELEASES on the dark
// overlay. The browser fires the `click` on the nearest common ancestor of the mousedown and
// mouseup targets — which is the backdrop — so `onClick` runs and the modal closes, losing input.
// It reads to the user as "the modal closes when the cursor moves outside".
//
// Correct behaviour: close ONLY when a deliberate click both STARTS and ENDS on the backdrop
// itself. We remember where the press began (onMouseDown) and only close if that press started on
// the backdrop and the resulting click also resolves to the backdrop. A press that began on an
// element INSIDE the modal can never close it, no matter where the mouse is released. Nothing here
// reacts to mouse movement / hover, so moving the cursor out never closes anything.
//
// Usage on a backdrop (overlay) element:
//   <div className="fixed inset-0 …" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
//
// The module-level `downTarget` is safe: a document only has one press→release in flight at a time.
// ============================================================================
let downTarget: EventTarget | null = null;

export function onBackdropDown(e: React.MouseEvent): void {
  // Records the element the press began on. For a press inside the modal this is an inner element
  // (bubbled up to the backdrop handler); for a press on the overlay it is the backdrop itself.
  downTarget = e.target;
}

export function backdropClose(onClose: () => void) {
  return (e: React.MouseEvent): void => {
    const startedOnBackdrop = downTarget === e.currentTarget; // press began on the overlay itself
    downTarget = null;
    // Also require the click to resolve to the backdrop (not an inner element), so a click that
    // began and ended inside the modal never closes it even without stopPropagation.
    if (startedOnBackdrop && e.target === e.currentTarget) onClose();
  };
}
