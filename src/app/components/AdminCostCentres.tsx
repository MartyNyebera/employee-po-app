// ============================================================================
// CONTRACT TRADING and FACILITIES in the Administrator dashboard: the SAME screens, modals and Expenses list the
// Accounting portal renders (components/CostCentres), with the lists and spend loaded here from the admin fetcher.
// Every figure comes from the same endpoints (/tradings/spend, /profit-rollup, /facilities/spend), so it is identical.
// ============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirm';
import type { BasisTotals } from './DualBasisProfit';
import { DisbursementVoucherModal } from './DisbursementVoucher';
import { useVoucherTargets } from './AdminAccountingScreens';
import {
  TradingsScreen, FacilitiesScreen, TradingModal, FacilityModal, ExpensesModal, tradingExpenseStats, facilityExpenseStats,
  type Api, type Trading, type Facility, type TradingSpend, type FacilitySpend, type TargetRef,
} from './CostCentres';

/** The voucher form, opened from a trading deal / facility (its first expense line pre-pointed at it) or blank. */
function useVoucherForm(api: Api, reloadKey: number) {
  const t = useVoucherTargets(api, reloadKey);
  const [open, setOpen] = useState<{ target: TargetRef | null } | null>(null);
  const node = (onSaved: () => void) => open && (
    <DisbursementVoucherModal api={api} projects={t.projects} tradings={t.tradings} facilities={t.facilities}
      initialTarget={open.target} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onSaved(); }} />
  );
  return { setOpen, node, empty: t.projects.length === 0 && t.tradings.length === 0 && t.facilities.length === 0 };
}

export function AdminTradings({ api, isAdmin, focusId = null }: { api: Api; isAdmin: boolean; focusId?: string | null }) {
  const [tradings, setTradings] = useState<Trading[]>([]);
  const [spend, setSpend] = useState<Record<string, TradingSpend> | null>(null);
  const [rollup, setRollup] = useState<{ tradings?: BasisTotals } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Trading | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expensesFor, setExpensesFor] = useState<TargetRef | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const voucher = useVoucherForm(api, reloadKey);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [trd, tSpend, roll] = await Promise.all([
        api<Trading[]>('/tradings').catch(() => [] as Trading[]),
        api<TradingSpend[]>('/tradings/spend').catch(() => null),
        api<{ tradings?: BasisTotals }>('/profit-rollup').catch(() => null),
      ]);
      setTradings(trd || []);
      setSpend(tSpend ? Object.fromEntries(tSpend.map(s => [s.tradingId, s])) : null);
      setRollup(roll ?? null);
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Opened from an Overview link: scroll the deal into view (it is also highlighted).
  useEffect(() => {
    if (!focusId || loading) return;
    const tm = setTimeout(() => document.getElementById(`row-${focusId}`)?.scrollIntoView({ block: 'center' }), 80);
    return () => clearTimeout(tm);
  }, [focusId, loading]);

  // Same rule and wording as the Accounting portal: the server refuses (409) a deal with PRs or expenses on it.
  const remove = async (t: Trading) => {
    if (!(await confirmDialog({ title: `Delete "${t.name}"?`, message: 'This cannot be undone. A trading with purchase requests or expenses on it cannot be deleted.', confirmLabel: 'Delete trading', tone: 'danger' }))) return;
    try { await api(`/tradings/${t.id}`, { method: 'DELETE' }); toast.success('Trading deleted'); load(); setReloadKey(n => n + 1); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  return (
    <>
      <TradingsScreen api={api} tradings={tradings} tradingSpend={spend} rollupTradings={rollup?.tradings ?? null}
        loading={loading} canManage={isAdmin} rowFocus={focusId} newVoucherDisabled={voucher.empty}
        onNewVoucher={() => voucher.setOpen({ target: null })}
        onNew={() => { setEditing(null); setShowModal(true); }}
        onEdit={(t) => { setEditing(t); setShowModal(true); }}
        onDelete={remove} onExpenses={setExpensesFor} />
      {showModal && (
        <TradingModal api={api} trading={editing} onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); load(); setReloadKey(n => n + 1); }} />
      )}
      {expensesFor && (
        <ExpensesModal api={api} target={expensesFor} reloadKey={reloadKey} canManage={isAdmin}
          stats={tradingExpenseStats(spend?.[expensesFor.id] ?? null)}
          onClose={() => setExpensesFor(null)} onLog={() => voucher.setOpen({ target: expensesFor })}
          onChanged={() => load({ silent: true })} />
      )}
      {voucher.node(() => { setReloadKey(n => n + 1); load({ silent: true }); })}
    </>
  );
}

export function AdminFacilities({ api, isAdmin }: { api: Api; isAdmin: boolean }) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [spend, setSpend] = useState<Record<string, FacilitySpend> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expensesFor, setExpensesFor] = useState<TargetRef | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const voucher = useVoucherForm(api, reloadKey);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [fac, fSpend] = await Promise.all([
        api<Facility[]>('/facilities').catch(() => [] as Facility[]),
        api<FacilitySpend[]>('/facilities/spend').catch(() => null),
      ]);
      setFacilities(fac || []);
      setSpend(fSpend ? Object.fromEntries(fSpend.map(s => [s.facilityId, s])) : null);
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (f: Facility) => {
    if (!(await confirmDialog({ title: `Delete facility "${f.name}"?`, message: 'Purchase requests that referenced it will show as "Personal use".', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = facilities; setFacilities(facilities.filter(x => x.id !== f.id));
    try { await api(`/facilities/${f.id}`, { method: 'DELETE' }); toast.success('Facility deleted'); setReloadKey(n => n + 1); }
    catch (e: any) { setFacilities(prev); toast.error('Delete failed: ' + e.message); }
  };

  return (
    <>
      <FacilitiesScreen api={api} facilities={facilities} facilitySpend={spend} loading={loading} canManage={isAdmin}
        onNew={() => { setEditing(null); setShowModal(true); }}
        onEdit={(f) => { setEditing(f); setShowModal(true); }}
        onDelete={remove} onExpenses={setExpensesFor} />
      {showModal && (
        <FacilityModal api={api} initial={editing} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); setReloadKey(n => n + 1); }} />
      )}
      {expensesFor && (
        <ExpensesModal api={api} target={expensesFor} reloadKey={reloadKey} canManage={isAdmin}
          stats={facilityExpenseStats(spend?.[expensesFor.id] ?? null)}
          onClose={() => setExpensesFor(null)} onLog={() => voucher.setOpen({ target: expensesFor })}
          onChanged={() => load({ silent: true })} />
      )}
      {voucher.node(() => { setReloadKey(n => n + 1); load({ silent: true }); })}
    </>
  );
}
