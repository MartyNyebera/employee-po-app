import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Shared "New Purchase Request" form (#1 — every department can raise a PR).
//
// The production portal (RequestsPage) keeps its own copy of this flow; this is the portable
// version every OTHER portal mounts. It is fully self-contained: it loads /inventory and
// /projects through whatever authed fetch wrapper the host portal passes in (pFetch, sFetch,
// wFetch, lFetch, aFetch, empFetch), owns all form state, and POSTs to /purchase-requests via
// that same wrapper. The server takes the requester's identity from the token, so no portal
// needs to send it. All three routes it touches are open to any authenticated department.
// ============================================================================

type FetchApi = <T = any>(path: string, options?: RequestInit) => Promise<T>;

// quantity/unitCost are strings so the fields can be fully cleared (avoids the "can't erase the
// leading 0" bug). A line is either an inventory item (default) or a free-text `kind: 'labor'`
// line ("supply labor") that carries its own note and is not stock.
interface FormLine { id: string; no: number; kind?: 'labor'; description: string; laborNote?: string; inventoryId: string | null; quantity: string; unit: string; unitCost: string; amount: number; }
interface InventoryItem { id: string; itemCode: string; itemName: string; quantity: number; unit: string; location?: string; }
interface Project { id: string; name: string; status?: string; }
interface ItemRequest { id: string; requestNumber?: string | null; itemName: string; status: string; }

const UNITS = ['pcs', 'bags', 'kg', 'liters', 'meters', 'boxes', 'sets', 'Lot', 'units'];
// "For (Project)" is required; Personal use gets its own sentinel (mapped back to a null
// projectId on submit) and '' means "nothing picked yet".
const PERSONAL_USE = '__personal__';

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (items: { amount: number }[]) => items.reduce((t, i) => t + (Number(i.amount) || 0), 0);

const emptyLine = (no: number): FormLine => ({ id: `new-${no}-${no}${Math.floor(no * 97)}`, no, description: '', inventoryId: null, quantity: '1', unit: 'pcs', unitCost: '', amount: 0 });
// #6 — a supply-labor line: free-text, priced as a lot, with its own note.
const emptyLaborLine = (no: number): FormLine => ({ id: `lab-${no}-${Math.floor(no * 131)}`, no, kind: 'labor', description: '', laborNote: '', inventoryId: null, quantity: '1', unit: 'lot', unitCost: '', amount: 0 });

// ---------------------------------------------------------------------------
// Inventory autocomplete. Resolves a real InventoryItem (name + id) so a delivered PO can add
// stock back to the right row later. The escape hatch (Request from the warehouse) is the only
// way out of the closed list when the item isn't stocked yet.
// ---------------------------------------------------------------------------
function ItemPicker({ value, onCommit, inventory, onRequestNew }: {
  value: string;
  onCommit: (name: string, unit?: string, inventoryId?: string | null) => void;
  inventory: InventoryItem[];
  onRequestNew: (typedName: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const queryRef = useRef(query); queryRef.current = query;
  const valueRef = useRef(value); valueRef.current = value;

  const q = query.trim().toLowerCase();
  const exact = inventory.some((iv) => iv.itemName.toLowerCase() === q);
  const list = (!q || exact) ? inventory : inventory.filter((iv) => iv.itemName.toLowerCase().includes(q));

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setCoords({ left: r.left, top: r.bottom + 4, width: r.width });
  };
  const openMenu = () => { place(); setOpen(true); };
  const commit = (iv: InventoryItem) => { onCommit(iv.itemName, iv.unit, iv.id); setQuery(iv.itemName); setOpen(false); };

  const resolveOnBlur = () => {
    setOpen(false);
    const cur = queryRef.current.trim();
    if (!cur) { onCommit('', undefined, null); setQuery(''); return; }
    const match = inventory.find((iv) => iv.itemName.toLowerCase() === cur.toLowerCase());
    if (match) { onCommit(match.itemName, match.unit, match.id); setQuery(match.itemName); }
    else setQuery(valueRef.current);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); place(); setOpen(true); }}
        onFocus={openMenu}
        onClick={openMenu}
        onBlur={() => setTimeout(resolveOnBlur, 150)}
        placeholder={inventory.length ? 'Select an item' : 'No inventory items yet'}
        className="w-full min-w-[10rem] px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && coords && createPortal(
        <ul
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: coords.width, zIndex: 60 }}
          className="max-h-56 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg text-sm py-1"
        >
          {list.length === 0 ? (
            <li>
              <div className="px-3 py-2 text-gray-400">No matching inventory items</div>
              {q && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onRequestNew(query.trim()); setOpen(false); }}
                  className="w-full text-left px-3 py-2 border-t border-gray-100 text-brand-gold hover:bg-gray-50 flex items-center gap-2"
                >
                  <PackagePlus className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Request “{query.trim()}” from the warehouse</span>
                </button>
              )}
            </li>
          ) : list.map((iv) => (
            <li key={iv.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(iv); }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3"
              >
                <span className="truncate text-gray-900">{iv.itemName}</span>
                <span className="flex-shrink-0 text-xs text-gray-400">{iv.unit} · {iv.quantity} in stock</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ask the warehouse to stock an item the picker doesn't offer. POSTs an item-request via the
// host portal's wrapper (/item-requests is open to any authenticated department).
// ---------------------------------------------------------------------------
function RequestItemModal({ fetchApi, initialName, onCancel, onDone }: {
  fetchApi: FetchApi; initialName?: string; onCancel: () => void; onDone: (created: ItemRequest) => void;
}) {
  const [f, setF] = useState({ itemName: initialName || '', unit: 'pcs', description: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.itemName.trim()) { toast.error('An item name is required'); return; }
    setSaving(true);
    try {
      const created = await fetchApi<ItemRequest>('/item-requests', {
        method: 'POST',
        body: JSON.stringify({ itemName: f.itemName.trim(), unit: f.unit, description: f.description.trim() || null, reason: f.reason.trim() || null }),
      });
      toast.success(`${created.requestNumber || 'Request'} sent to the warehouse`);
      onDone(created);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send the request');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Request a new item</h2>
            <p className="text-xs text-gray-400 mt-0.5">The warehouse adds it to inventory, then you can select it</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name *</label>
            <input autoFocus value={f.itemName} onChange={(e) => set('itemName', e.target.value)}
              placeholder="e.g. 6205 Deep Groove Ball Bearing"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select value={f.unit} onChange={(e) => set('unit', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specification</label>
            <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Size, grade, brand — anything the warehouse needs to identify it"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Why you need it</label>
            <textarea rows={2} value={f.reason} onChange={(e) => set('reason', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Sending…' : 'Send to warehouse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The form itself.
// ---------------------------------------------------------------------------
export function CreatePurchaseRequestForm({ fetchApi, session, onSubmitted }: {
  fetchApi: FetchApi;
  session: { full_name: string };
  onSubmitted?: () => void;
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [neededBy, setNeededBy] = useState('');
  const [lineItems, setLineItems] = useState<FormLine[]>([emptyLine(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [requestingItem, setRequestingItem] = useState<string | null>(null);

  const loadRefs = async () => {
    try {
      const [inv, prj] = await Promise.all([
        fetchApi<InventoryItem[]>('/inventory'),
        fetchApi<Project[]>('/projects').catch(() => [] as Project[]),
      ]);
      setInventory(inv || []);
      setProjects(prj || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load items and projects');
    }
  };
  useEffect(() => { loadRefs(); }, []);

  const updateLineItem = (id: string, field: keyof FormLine, value: string | null) => {
    setLineItems((prev) => prev.map((li) => {
      if (li.id !== id) return li;
      const next = { ...li, [field]: value } as FormLine;
      if (field === 'quantity' || field === 'unitCost') next.amount = (Number(next.quantity) || 0) * (Number(next.unitCost) || 0);
      if (field === 'description') {
        const match = inventory.find((iv) => iv.itemName.toLowerCase() === String(value || '').trim().toLowerCase());
        if (match?.unit) next.unit = match.unit;
      }
      return next;
    }));
  };
  const addLineItem = () => setLineItems((prev) => [...prev, emptyLine(prev.length + 1)]);
  const addLaborLine = () => setLineItems((prev) => [...prev, emptyLaborLine(prev.length + 1)]);
  const deleteLineItem = (id: string) => setLineItems((prev) => prev.filter((li) => li.id !== id).map((li, i) => ({ ...li, no: i + 1 })));
  const subTotal = useMemo(() => sum(lineItems), [lineItems]);
  const resetForm = () => { setProjectId(''); setNeededBy(''); setLineItems([emptyLine(1)]); };

  const handleSubmit = async () => {
    if (!projectId) { toast.error('Choose what this request is for'); return; }
    if (!neededBy) { toast.error('Set the date this is needed by'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item'); return; }
    // #3 — a labor line has no qty/unit; it only needs a description and a cost. Item lines
    // still require description, quantity, unit and est. cost.
    const incomplete = lineItems.find((li) => li.kind === 'labor'
      ? (!li.description.trim() || !(Number(li.unitCost) > 0))
      : (!li.description.trim() || !li.unit || !(Number(li.quantity) > 0) || !(Number(li.unitCost) > 0)));
    if (incomplete) {
      toast.error(incomplete.kind === 'labor'
        ? `Labor line ${incomplete.no} is incomplete — a description and a cost are required`
        : `Line ${incomplete.no} is incomplete — description, quantity, unit and est. cost are all required`);
      return;
    }
    const valid = lineItems;
    // Only inventory items may be requested — a labor line is free-text and exempt.
    const known = new Set(inventory.map((iv) => iv.itemName.toLowerCase()));
    const unknown = valid.find((li) => li.kind !== 'labor' && !known.has(li.description.trim().toLowerCase()));
    if (unknown) { toast.error(`"${unknown.description}" is not in inventory — pick an item from the list`); return; }
    setSubmitting(true);
    try {
      await fetchApi('/purchase-requests', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId === PERSONAL_USE ? null : projectId,
          neededBy,
          items: valid.map((li, i) => li.kind === 'labor'
            ? {
                no: i + 1, kind: 'labor', description: li.description.trim(),
                laborNote: (li.laborNote || '').trim() || null,
                inventoryId: null, quantity: Number(li.quantity), unit: li.unit || 'lot',
                unitCost: Number(li.unitCost) || 0, amount: Number(li.amount) || 0,
              }
            : {
                no: i + 1,
                description: li.description.trim(),
                inventoryId: li.inventoryId
                  || inventory.find((iv) => iv.itemName.toLowerCase() === li.description.trim().toLowerCase())?.id
                  || null,
                quantity: Number(li.quantity), unit: li.unit,
                unitCost: Number(li.unitCost) || 0, amount: Number(li.amount) || 0,
              }),
        }),
      });
      toast.success('Purchase request submitted');
      resetForm();
      onSubmitted?.();
    } catch (e: any) { toast.error(e.message || 'Failed to submit request'); } finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Purchase Request</h2>
          <p className="text-sm text-gray-500 mt-0.5">Requesting as <span className="font-medium text-gray-700">{session.full_name}</span></p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">For (Project) <span className="text-red-500">*</span></label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="" disabled>Select…</option>
                <option value={PERSONAL_USE}>Personal use</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Needed By <span className="text-red-500">*</span></label>
              <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Items</label>
              <div className="flex items-center gap-1">
                <button onClick={addLineItem} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"><Plus className="w-4 h-4" /> Add item</button>
                <button onClick={addLaborLine} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"><Plus className="w-4 h-4" /> Add labor</button>
              </div>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left font-medium px-3 py-2 w-10">No</th>
                    <th className="text-left font-medium px-3 py-2">Description <span className="text-red-500">*</span></th>
                    <th className="text-left font-medium px-3 py-2 w-20">Qty <span className="text-red-500">*</span></th>
                    <th className="text-left font-medium px-3 py-2 w-28">Unit <span className="text-red-500">*</span></th>
                    <th className="text-left font-medium px-3 py-2 w-32">Est. Cost <span className="text-red-500">*</span></th>
                    <th className="text-right font-medium px-3 py-2 w-32">Amount</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-gray-400 align-top">{li.no}{li.kind === 'labor' && <div className="text-[10px] font-semibold text-blue-500 uppercase">Labor</div>}</td>
                      <td className="px-3 py-2">
                        {li.kind === 'labor' ? (
                          <div className="space-y-1">
                            <input value={li.description} onChange={(e) => updateLineItem(li.id, 'description', e.target.value)} placeholder="Labor description (e.g. Installation labor)" className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <textarea value={li.laborNote || ''} onChange={(e) => updateLineItem(li.id, 'laborNote', e.target.value)} placeholder="Note (optional — press Enter for a new line)" rows={2} className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                          </div>
                        ) : (
                          <ItemPicker value={li.description} onCommit={(name, unit, inventoryId) => { updateLineItem(li.id, 'description', name); updateLineItem(li.id, 'inventoryId', inventoryId ?? null); if (unit) updateLineItem(li.id, 'unit', unit); }} inventory={inventory} onRequestNew={setRequestingItem} />
                        )}
                      </td>
                      {/* #3 — labor has no quantity or unit; show a dash placeholder instead of inputs. */}
                      <td className="px-3 py-2 align-top text-center text-gray-400">{li.kind === 'labor' ? '—' : <input type="number" min="0" value={li.quantity} onChange={(e) => updateLineItem(li.id, 'quantity', e.target.value)} placeholder="0" className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />}</td>
                      <td className="px-3 py-2 text-center text-gray-400">
                        {li.kind === 'labor' ? '—' : (
                          <select value={li.unit} onChange={(e) => updateLineItem(li.id, 'unit', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={li.unitCost} onChange={(e) => updateLineItem(li.id, 'unitCost', e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{peso(li.amount)}</td>
                      <td className="px-2 py-2 text-center">{lineItems.length > 1 && <button onClick={() => deleteLineItem(li.id)} className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3">
              <div className="w-56 flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900">{peso(subTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={resetForm} className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Clear</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </div>
      </div>

      {requestingItem !== null && (
        <RequestItemModal
          fetchApi={fetchApi}
          initialName={requestingItem}
          onCancel={() => setRequestingItem(null)}
          onDone={() => { setRequestingItem(null); loadRefs(); }}
        />
      )}
    </div>
  );
}

export default CreatePurchaseRequestForm;
