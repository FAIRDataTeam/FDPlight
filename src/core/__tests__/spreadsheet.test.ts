// Reading the ERDERA metadata spreadsheet, as a workbook or as TSV files (SPEC §4.4).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { utils, write } from 'xlsx';
import { cellText, norm, parseTsv, readSpreadsheet, readXlsx, sheetNameOfFile, type SheetFile } from '../spreadsheet';

const dir = fileURLToPath(new URL('./fixtures/synthetic-registry/', import.meta.url));
const file = (name: string, as = name): SheetFile => ({ name: as, data: new Uint8Array(readFileSync(dir + name)) });
const text = (name: string, content: string): SheetFile => ({ name, data: new TextEncoder().encode(content) });

describe('spreadsheet reader (SPEC §4.4)', () => {
  it('reads every sheet of the official workbook, with headers and only non-empty rows', () => {
    const sheets = readXlsx(file('synthetic-registry.xlsx').data);
    expect(sheets.map((s) => s.name)).toEqual([
      'Organisation', 'ContactPoint', 'Biobank', 'PatientRegistry', 'Guideline', 'Dataset', 'Distribution', 'DataService', 'Catalog', 'Mediatypes', 'Languages',
    ]);
    const reg = sheets.find((s) => s.name === 'PatientRegistry')!;
    expect(reg.header.slice(0, 3)).toEqual(['License', 'Title', 'Description']);
    expect(reg.header).toContain('ODRL Policy');
    expect(reg.rows).toHaveLength(1);
    expect(reg.rows[0].n).toBe(2);
    expect(reg.rows[0].cells[reg.header.indexOf('Keyword')]).toBe('CAKUT|synthetic|patient registry');
    expect(sheets.find((s) => s.name === 'Biobank')!.rows).toEqual([]);
  });

  it('reads TSV files, named after their sheet, with the same cells as the workbook', () => {
    const r = readSpreadsheet(['Organisation', 'ContactPoint', 'PatientRegistry', 'Catalog'].map((s) => file(`${s}.tsv`)));
    if (!r.ok) throw new Error(r.error);
    const xlsx = readXlsx(file('synthetic-registry.xlsx').data);
    for (const s of r.sheets) {
      const x = xlsx.find((y) => y.name === s.name)!;
      const width = s.header.length;
      expect(x.header.slice(0, width), s.name).toEqual(s.header);
      expect(x.rows.map((row) => ({ n: row.n, cells: row.cells.slice(0, width) })), s.name).toEqual(s.rows);
    }
  });

  it("maps a TSV file to the sheet its name ends with (Google Sheets' export names too)", () => {
    expect(sheetNameOfFile('EJPRD Resource Metadata template - Catalog.tsv')).toBe('Catalog');
    expect(sheetNameOfFile('Catalog.tsv')).toBe('Catalog');
    expect(sheetNameOfFile('my sheet - patient registry.TSV')).toBe('PatientRegistry');
    expect(sheetNameOfFile('export-DataService.tsv')).toBe('DataService');
    expect(sheetNameOfFile('export-Dataset.tsv')).toBe('Dataset');
    expect(sheetNameOfFile('EJPRD Resource Metadata template - Notes.tsv')).toBe('Notes');
    expect(sheetNameOfFile('Notes.tsv')).toBe('Notes');
  });

  it('matches names case- and space-insensitively', () => {
    expect(norm('ODRL Policy')).toBe(norm('ODRLPolicy'));
    expect(norm(' Patient Registry ')).toBe('patientregistry');
  });

  it('parses quoted TSV fields (Excel) and plain ones (Google Sheets), any line ending, a BOM', () => {
    expect(parseTsv('a\tb\r\n"x\ty"\t"say ""hi"""\n"two\nlines"\t\n')).toEqual([['a', 'b'], ['x\ty', 'say "hi"'], ['two\nlines', '']]);
    expect(parseTsv('a\tb\n\n')).toEqual([['a', 'b']]);
    const r = readSpreadsheet([text('Catalog.tsv', '﻿Title\tKeyword\n\t\nOne\tx\n')]);
    expect(r.ok && r.sheets[0]).toEqual({ name: 'Catalog', file: 'Catalog.tsv', header: ['Title', 'Keyword'], rows: [{ n: 3, cells: ['One', 'x'] }] });
  });

  it('reads UTF-16 TSV (Excel "Unicode text")', () => {
    const s = 'Title\nCafé\n';
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < s.length; i++) bytes.set([s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8], 2 + i * 2);
    const r = readSpreadsheet([{ name: 'Catalog.tsv', data: bytes }]);
    expect(r.ok && r.sheets[0].rows[0].cells).toEqual(['Café']);
  });

  it('turns booleans, dates and numbers into the text the user typed', () => {
    const ws = utils.aoa_to_sheet([['PersonalData', 'Issued', 'Modified', 'Version'], [true, new Date(2026, 10, 6), new Date(2026, 10, 6, 13, 5, 0), 0.1]], { cellDates: true });
    const data = write({ SheetNames: ['Dataset'], Sheets: { Dataset: ws } }, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const [sheet] = readXlsx(new Uint8Array(data));
    expect(sheet.rows[0].cells).toEqual(['true', '2026-11-06', '2026-11-06T13:05:00', '0.1']);
    expect(cellText({ t: 'b', v: false })).toBe('false');
    expect(cellText(undefined)).toBe('');
  });

  it('wants one workbook or TSV files only, and reports a sheet given twice', () => {
    expect(readSpreadsheet([])).toEqual({ ok: false, error: 'Choose the spreadsheet: one .xlsx workbook or one .tsv file per sheet' });
    expect(readSpreadsheet([file('synthetic-registry.xlsx'), file('Catalog.tsv')])).toEqual({
      ok: false,
      error: 'Choose one .xlsx workbook, or one .tsv file per sheet',
    });
    expect(readSpreadsheet([text('notes.csv', 'a,b')]).ok).toBe(false);
    const r = readSpreadsheet([file('Catalog.tsv'), file('Catalog.tsv', 'EJPRD Resource Metadata template - Catalog.tsv')]);
    expect(r.ok && r.sheets.length).toBe(1);
    expect(r.ok && r.notes).toEqual(['EJPRD Resource Metadata template - Catalog.tsv: Catalog.tsv is already the Catalog sheet; not read']);
    expect(readSpreadsheet([text('x.xlsx', 'not a workbook')])).toEqual({ ok: false, error: 'x.xlsx is not an .xlsx workbook' });
  });
});
