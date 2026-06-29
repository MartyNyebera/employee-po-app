// Shared order-creation helpers so Sales Orders and Purchase Orders are created the
// same way whether they come from their own routes or from converting a quotation.
// These create NORMAL sales_orders / purchase_orders rows — no new order types.
import { query } from './db.js';

// Next KTCI-YYYY-NNNN purchase order number (mirrors the inline logic in POST /api/purchase-orders).
async function nextPoNumber() {
  const year = new Date().getFullYear();
  const last = await query(
    `SELECT po_number FROM purchase_orders WHERE po_number LIKE 'KTCI-${year}-%' ORDER BY po_number DESC LIMIT 1`
  );
  let counter = 1;
  if (last.rows.length > 0) {
    const n = parseInt(last.rows[0].po_number.split('-')[2], 10);
    if (!isNaN(n)) counter = n + 1;
  }
  return `KTCI-${year}-${counter.toString().padStart(4, '0')}`;
}

// Next SO-YYYY-NNNN sales order number (used when a caller doesn't supply one, e.g. conversion).
async function nextSoNumber() {
  const year = new Date().getFullYear();
  const last = await query(
    `SELECT so_number FROM sales_orders WHERE so_number LIKE 'SO-${year}-%' ORDER BY so_number DESC LIMIT 1`
  );
  let counter = 1;
  if (last.rows.length > 0) {
    const parts = last.rows[0].so_number.split('-');
    const n = parseInt(parts[2], 10);
    if (!isNaN(n)) counter = n + 1;
  }
  return `SO-${year}-${counter.toString().padStart(4, '0')}`;
}

const today = () => new Date().toISOString().split('T')[0];

// Default name printed in the "Prepared By" box unless the caller/UI overrides it.
export const DEFAULT_PREPARED_BY = 'Kim Karen D. Tagle';
const DEFAULT_PAYMENT_TERMS = '30 days from receipt/acceptance';

// Create a sales order row. Returns the raw DB row (caller maps to camelCase).
export async function createSalesOrder({
  soNumber, client, customerId = null, description, amount,
  deliveryDate, createdDate, assignedAssets = [],
  line = null, source = null, inquiryId = null, costAmount = null, status = 'pending',
  // editable PDF header fields
  docDate, preparedBy, reviewedBy = null, customerAddress = null, customerContact = null,
  paymentTerms, termsAndConditions = null,
}) {
  const id = `SO-${Date.now()}`;
  const finalSo = soNumber || (await nextSoNumber());
  const created = createdDate || today();
  const { rows: [row] } = await query(
    `INSERT INTO sales_orders
       (id, so_number, client, customer_id, description, amount, status, created_date, delivery_date,
        assigned_assets, line, source, inquiry_id, cost_amount,
        doc_date, prepared_by, reviewed_by, customer_address, customer_contact, payment_terms, terms_and_conditions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [id, finalSo, client, customerId, description, amount, status, created, deliveryDate || created,
     assignedAssets, line, source, inquiryId, costAmount,
     docDate || created, preparedBy || DEFAULT_PREPARED_BY, reviewedBy, customerAddress, customerContact,
     paymentTerms || DEFAULT_PAYMENT_TERMS, termsAndConditions]
  );
  return row;
}

// Create a purchase order row. Returns the raw DB row (caller maps to camelCase).
export async function createPurchaseOrder({
  client, description, amount, deliveryDate, createdDate, assignedAssets = [],
  supplierId = null, inquiryId = null, orderType = null, status = 'pending',
  // editable PDF header fields
  docDate, preparedBy, reviewedBy = null, supplierAddress = null, supplierContact = null,
  paymentTerms, termsAndConditions = null,
}) {
  const id = `PO-${Date.now()}`;
  const poNumber = await nextPoNumber();
  const created = createdDate || today();
  const { rows: [row] } = await query(
    `INSERT INTO purchase_orders
       (id, po_number, client, description, amount, status, created_date, delivery_date,
        assigned_assets, order_type, supplier_id, inquiry_id,
        doc_date, prepared_by, reviewed_by, supplier_address, supplier_contact, payment_terms, terms_and_conditions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [id, poNumber, client, description, amount, status, created, deliveryDate || created,
     assignedAssets, orderType, supplierId, inquiryId,
     docDate || created, preparedBy || DEFAULT_PREPARED_BY, reviewedBy, supplierAddress, supplierContact,
     paymentTerms || DEFAULT_PAYMENT_TERMS, termsAndConditions]
  );
  return row;
}
