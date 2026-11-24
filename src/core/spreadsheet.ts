// Read a metadata spreadsheet (SPEC §4.4, TASKS Phase 9): one .xlsx workbook
// (SheetJS) or several .tsv files, one per sheet. The result is plain text:
// per sheet its header row and its non-empty data rows, every cell trimmed.
// What the sheets mean is the mapper's business (spreadsheetMap.ts).

// SheetJS's "mini" build reads .xlsx like the full one, without the formats and
// code pages FDPlight does not need: about 100 kB less in the single-file app.
import { read, SSF, utils, type CellObject, type WorkSheet } from 'xlsx/dist/xlsx.mini.min.js';
import { say } from './messages';

/** The sheets of the ERDERA resource metadata template, in workbook order. */
export const TEMPLATE_SHEETS = [
  'Organisation',
  'ContactPoint',
  'Biobank',
  'PatientRegistry',
  'Guideline',
  'Dataset',
  'Distribution',
  'DataService',
  'Catalog',
  'Mediatypes',
  'Languages',
];

export interface SheetRow {
  /** Row number in the sheet as the user sees it: the header is row 1. */
  n: number;
  cells: string[];
}

export interface Sheet {
  /** As written in the workbook, or taken from the TSV file name. */
  name: string;
  /** The TSV file it came from. */
  file?: string;
  header: string[];
  /** Rows with at least one non-empty cell. */
  rows: SheetRow[];
}

export interface SheetFile {
  name: string;
  data: Uint8Array;
}

export type ReadResult = { ok: true; sheets: Sheet[]; notes: string[] } | { ok: false; error: string };

/** SPEC §4.4. Sheet names and headers match case- and space-insensitively. */
export const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

const isXlsx = (name: string) => /\.xlsx$/i.test(name);
const isTsv = (name: string) => /\.tsv$/i.test(name);

/** SPEC §4.4. One .xlsx workbook, or one .tsv file per sheet. */
export function readSpreadsheet(files: SheetFile[]): ReadResult {
  if (!files.length) return { ok: false, error: say('sheetNoFiles') };
  const xlsx = files.filter((f) => isXlsx(f.name));
  const tsv = files.filter((f) => isTsv(f.name));
  if (!(xlsx.length === 1 && files.length === 1) && tsv.length !== files.length)
    return { ok: false, error: say('sheetChooseFiles') };
  if (xlsx.length) {
    // An .xlsx file is a zip archive.
    const d = xlsx[0].data;
    if (!(d[0] === 0x50 && d[1] === 0x4b && d[2] === 0x03 && d[3] === 0x04)) return { ok: false, error: say('sheetNotXlsx', { file: xlsx[0].name }) };
    try {
      return { ok: true, sheets: readXlsx(xlsx[0].data), notes: [] };
    } catch (e) {
      return { ok: false, error: say('sheetUnreadable', { file: xlsx[0].name, error: e instanceof Error ? e.message : String(e) }) };
    }
  }
  const sheets: Sheet[] = [];
  const notes: string[] = [];
  for (const f of tsv) {
    const name = sheetNameOfFile(f.name);
    const first = sheets.find((s) => norm(s.name) === norm(name));
    if (first) {
      notes.push(say('sheetTwoFiles', { sheet: name, file: first.file ?? '', other: f.name }));
      continue;
    }
    sheets.push({ name, file: f.name, ...table(parseTsv(decode(f.data))) });
  }
  return { ok: true, sheets, notes };
}

/**
 * SPEC §4.4. The sheet a TSV file holds: the template sheet its name ends
 * with (Google Sheets exports "EJPRD Resource Metadata template - Catalog.tsv";
 * a plain "Catalog.tsv" too), else the part after the last " - ", else the
 * whole name.
 */
export function sheetNameOfFile(fileName: string, known: string[] = TEMPLATE_SHEETS): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.tsv$/i, '');
  const hit = known
    .filter((k) => norm(base).endsWith(norm(k)))
    .sort((a, b) => b.length - a.length)[0];
  if (hit) return hit;
  const dash = base.lastIndexOf(' - ');
  return (dash < 0 ? base : base.slice(dash + 3)).trim();
}

/** UTF-8 unless the file starts with a UTF-16 byte-order mark (Excel's "Unicode text"). */
function decode(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data.subarray(2));
  return new TextDecoder('utf-8').decode(data).replace(/^﻿/, '');
}

/**
 * Tab-separated values. A field that starts with `"` is quoted (Excel's
 * export): it ends at the next lone `"`, `""` is a quote, and it may hold tabs
 * and line breaks. Other fields are taken as they are (Google Sheets).
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;
  while (i <= n) {
    let field = '';
    if (text[i] === '"') {
      i++;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        field += text[i++];
      }
      // Anything after the closing quote, up to the separator, belongs to the field.
      while (i < n && text[i] !== '\t' && text[i] !== '\n' && text[i] !== '\r') field += text[i++];
    } else {
      while (i < n && text[i] !== '\t' && text[i] !== '\n' && text[i] !== '\r') field += text[i++];
    }
    row.push(field);
    if (text[i] === '\t') {
      i++;
      continue;
    }
    rows.push(row);
    row = [];
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i++;
  }
  // A final line break leaves one empty row behind.
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

/** Header and non-empty rows of a grid, trimmed. */
function table(grid: string[][]): Pick<Sheet, 'header' | 'rows'> {
  const trimmed = grid.map((r) => r.map((c) => c.trim()));
  const header = trimmed[0] ?? [];
  const rows = trimmed
    .slice(1)
    .map((cells, i) => ({ n: i + 2, cells }))
    .filter((r) => r.cells.some(Boolean));
  return { header, rows };
}

/** SPEC §4.4. Every sheet of an .xlsx workbook, as text. */
export function readXlsx(data: Uint8Array): Sheet[] {
  const wb = read(data, { type: 'array', cellNF: true, cellHTML: false, cellStyles: false, sheetStubs: false });
  return wb.SheetNames.map((name) => ({ name, ...table(grid(wb.Sheets[name])) }));
}

function grid(ws: WorkSheet): string[][] {
  if (!ws['!ref']) return [];
  const range = utils.decode_range(ws['!ref']);
  const out: string[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = 0; c <= range.e.c; c++) row.push(cellText(ws[utils.encode_cell({ r, c })] as CellObject | undefined));
    out.push(row);
  }
  return out;
}

/**
 * SPEC §4.4. A cell as the text the user typed: booleans as `true` / `false`,
 * dates as ISO 8601 (`2026-11-06`, with the time when it has one), other
 * numbers as shown in the sheet.
 */
export function cellText(cell: CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'b') return cell.v ? 'true' : 'false';
  if (cell.t === 'd' && cell.v instanceof Date) return isoDate(cell.v.getFullYear(), cell.v.getMonth() + 1, cell.v.getDate(), cell.v.getHours(), cell.v.getMinutes(), cell.v.getSeconds());
  if (cell.t === 'n' && typeof cell.v === 'number' && cell.z !== undefined && SSF.is_date(cell.z)) {
    const d = SSF.parse_date_code(cell.v);
    if (d) return isoDate(d.y, d.m, d.d, d.H, d.M, d.S);
  }
  if (cell.t === 's') return String(cell.v);
  return cell.w ?? String(cell.v);
}

function isoDate(y: number, m: number, d: number, hh: number, mm: number, ss: number): string {
  const p = (x: number, w = 2) => String(x).padStart(w, '0');
  const date = `${p(y, 4)}-${p(m)}-${p(d)}`;
  return hh || mm || ss ? `${date}T${p(hh)}:${p(mm)}:${p(ss)}` : date;
}
