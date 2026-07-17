// ============================================================================
// The one count-bubble style, system-wide (#16). Every portal and the admin dashboard render
// their "N awaiting you" count through this, so the bubble is a single red pill everywhere
// instead of a different colour per portal (admin red, accounting/purchasing/logistics yellow).
//
// Two variants, matching how a sidebar collapses:
//   • expanded  — an inline pill that sits at the end of a nav row (ml-auto)
//   • collapsed — a small corner dot over the icon-only rail
// ============================================================================

export function NavBadge({ count, collapsed = false }: { count: number; collapsed?: boolean }) {
  if (!count) return null;
  const label = count > 99 ? '99+' : String(count);
  if (collapsed) {
    return (
      <span
        className="crm-nav-badge absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center"
        aria-label={`${count} awaiting attention`}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="crm-nav-badge ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center"
      aria-label={`${count} awaiting attention`}
    >
      {label}
    </span>
  );
}
