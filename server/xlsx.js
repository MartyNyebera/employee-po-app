// ============================================================================
// Minimal .xlsx writer — zero dependencies.
//
// WHY HAND-ROLLED: this repo has no xlsx/exceljs/jszip, and the Pi deploy is
// `git pull && npm run build && pm2 restart` with NO `npm install` step. Adding a
// dependency would therefore ship a server that crashes on import. An .xlsx is just a
// ZIP of XML parts, and Node's built-in zlib does the only hard part (DEFLATE), so the
// whole format costs ~120 lines and nothing to install.
//
// Scope is deliberately narrow: one sheet, inline strings (no sharedStrings part), a
// fixed handful of cell styles, optional freeze pane and autofilter. That is everything
// a report export needs. It is NOT a general spreadsheet library — no formulas, no
// multiple sheets, no dates-as-serials (pass dates pre-formatted as text).
// ============================================================================
import zlib from 'node:zlib';

// ---------- ZIP container ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// MS-DOS date/time, the only timestamp a ZIP local header carries. Fixed to a constant so
// the same data always produces a byte-identical file (which makes the output diffable in
// a test); the real export time is written into the sheet's header rows instead.
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

// Builds a ZIP from [{ name, data: Buffer }]. Every entry is DEFLATE (method 8).
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const comp = zlib.deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    centrals.push(cd, name);

    offset += lh.length + name.length + comp.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

// ---------- XML ----------
// XML 1.0 has no escape for most control characters, so they are dropped rather than
// escaped — a stray byte in a typed-in name would otherwise make the file unopenable.
const xmlEsc = (v) => String(v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const colName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0;) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
};

// Style indexes into cellXfs below. Exported so callers name a style instead of a number.
// TOTAL_LABEL and MONEY_BOLD carry a TOP border, which is what draws the rule above a totals
// row; SUBTITLE is the same bold with no border, for a heading line.
export const STYLE = { TEXT: 0, TITLE: 1, HEADER: 2, MONEY: 3, MONEY_BOLD: 4, NUMBER: 5, TOTAL_LABEL: 6, MUTED: 7, SUBTITLE: 8 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.##"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9A9A9A"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9A9A9A"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

// A cell is { v, s? }: a number v writes a numeric cell, a string writes an inline string,
// and null/undefined writes nothing at all (an empty cell, not a zero and not "").
function cellXml(ref, cell) {
  if (cell === null || cell === undefined) return '';
  const c = (typeof cell === 'object' && 'v' in cell) ? cell : { v: cell };
  if (c.v === null || c.v === undefined) return '';
  const s = c.s ? ` s="${c.s}"` : '';
  if (typeof c.v === 'number') {
    if (!Number.isFinite(c.v)) return '';
    return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
}

/**
 * Builds a single-sheet workbook.
 *   rows        — array of arrays of cells (see cellXml). Row 1 is rows[0].
 *   sheetName   — tab label (Excel forbids : \ / ? * [ ] and caps it at 31 chars).
 *   widths      — per-column character widths.
 *   freezeRows  — rows kept visible when scrolling (0 = none).
 *   autoFilter  — e.g. 'A5:J12', the header row plus its data.
 * Returns a Buffer holding the .xlsx.
 */
export function buildXlsx({ rows, sheetName = 'Sheet1', widths = [], freezeRows = 0, autoFilter = null }) {
  const safeName = String(sheetName).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet1';
  const body = rows.map((cells, r) =>
    `<row r="${r + 1}">${cells.map((c, i) => cellXml(colName(i) + (r + 1), c)).join('')}</row>`
  ).join('');
  const nCols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const dim = `A1:${colName(nCols - 1)}${Math.max(rows.length, 1)}`;
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  // Schema order inside <worksheet> is fixed: dimension, sheetViews, cols, sheetData, then
  // autoFilter. Excel rejects the file outright if these appear out of order.
  const pane = freezeRows > 0
    ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols}<sheetData>${body}</sheetData>${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ''}</worksheet>`;

  const B = (s) => Buffer.from(s, 'utf8');
  return zip([
    { name: '[Content_Types].xml', data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: B(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: B(sheet) },
  ]);
}
