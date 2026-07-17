// ============================================================================
// Next-department hint (#9). Given a document's status, which department is expected to act on
// it next? Rendered as muted text beside the status on purchase-request and purchase-order rows,
// so anyone looking at a row knows where it is in the flow without memorising the state machine.
//
// PR flow:  pending →(Accounting) reviewed →(Admin) verified →(Purchasing raises PO) ordered
//           →(Admin approves PO) approved.  disapproved is terminal.
// PO flow (Section C):  pending →(Accounting) accounting-approved →(Admin) approved
//           →(Warehouse receives) …  rejected → back to Purchasing.
// ============================================================================

export function nextDeptFor(status: string, kind: 'pr' | 'po'): string | null {
  if (kind === 'pr') {
    switch (status) {
      case 'pending': return 'Next: Accounting';
      case 'reviewed': return 'Next: Admin';
      case 'verified': return 'Next: Purchasing';
      case 'ordered': return 'Next: Admin';
      default: return null; // approved / disapproved are terminal for the request
    }
  }
  switch (status) {
    case 'pending': return 'Next: Accounting';
    case 'accounting-approved': return 'Next: Admin';
    case 'approved': return 'Next: Warehouse (delivery)';
    case 'rejected': return 'Next: Purchasing (revise)';
    default: return null; // in-progress / RECEIVED / cancelled need no hint
  }
}
