// ============================================================================
// Accounting screens that need a voucher form beside them, mounted in the Administrator dashboard.
//
// In the Accounting portal AccountingPortal owns the Disbursement Voucher modal and the lists of projects, trading
// deals and facilities it charges to. The Administrator dashboard has neither, so these two thin hosts load the lists
// with the caller's own fetcher and render the SAME screens (ExpensesHistory, PcfScreen) and the SAME form
// (DisbursementVoucherModal). Nothing about the screens or the form differs; only where the data comes from.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { ExpensesHistory, type TargetOption } from './ExpensesHistory';
import { DisbursementVoucherModal, type VoucherTargetItem } from './DisbursementVoucher';
import { PcfScreen } from './PcfScreen';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

/** What a voucher can be charged to: projects, trading deals and facilities. A list that cannot load is simply empty. */
function useVoucherTargets(api: Api) {
  const [projects, setProjects] = useState<VoucherTargetItem[]>([]);
  const [tradings, setTradings] = useState<VoucherTargetItem[]>([]);
  const [facilities, setFacilities] = useState<VoucherTargetItem[]>([]);
  useEffect(() => {
    let off = false;
    const load = (path: string, set: (x: VoucherTargetItem[]) => void) =>
      api<VoucherTargetItem[]>(path).then(r => { if (!off) set(Array.isArray(r) ? r : []); }).catch(() => { /* leave empty */ });
    load('/projects', setProjects); load('/tradings', setTradings); load('/facilities', setFacilities);
    return () => { off = true; };
  }, []);
  const targets: TargetOption[] = useMemo(() => [
    ...projects.map(p => ({ kind: 'project' as const, id: p.id, name: p.name })),
    ...tradings.map(t => ({ kind: 'trading' as const, id: t.id, name: t.name })),
    ...facilities.map(f => ({ kind: 'facility' as const, id: f.id, name: f.name })),
  ], [projects, tradings, facilities]);
  return { projects, tradings, facilities, targets };
}

/** Disbursement Report + its "New Voucher" form. */
export function AdminDisbursement({ api, isAdmin, initialSearch = '' }: { api: Api; isAdmin: boolean; initialSearch?: string }) {
  const t = useVoucherTargets(api);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <ExpensesHistory api={api} targets={t.targets} isAdmin={isAdmin} reloadKey={reloadKey} initialSearch={initialSearch}
        onNewVoucher={isAdmin ? () => setOpen(true) : undefined} />
      {open && (
        <DisbursementVoucherModal api={api} projects={t.projects} tradings={t.tradings} facilities={t.facilities}
          onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setReloadKey(n => n + 1); }} />
      )}
    </>
  );
}

/** Petty Cash Fund + "New PCF Voucher" (petty cash, expense lines only). */
export function AdminPcf({ api, isAdmin }: { api: Api; isAdmin: boolean }) {
  const t = useVoucherTargets(api);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <PcfScreen api={api} isAdmin={isAdmin} reloadKey={reloadKey} onNewVoucher={isAdmin ? () => setOpen(true) : undefined} />
      {open && (
        <DisbursementVoucherModal api={api} pettyCash projects={t.projects} tradings={t.tradings} facilities={t.facilities}
          onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setReloadKey(n => n + 1); }} />
      )}
    </>
  );
}
