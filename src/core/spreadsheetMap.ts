// Column mapper of the spreadsheet import (SPEC §4.4): which ERDERA profile
// field each column of the ERDERA resource metadata template fills, and how a
// cell becomes form values. Pointers to other rows (publisher, contact point,
// children, parents) are only collected here; spreadsheetImport.ts resolves
// them once every row has an IRI.

import {
  expandTerm,
  fieldKey,
  nestedFieldsOf,
  nestedShapeOf,
  normalizeNode,
  normalizeRecord,
  shapeFields,
  type RecordNode,
} from '@fairdatateam/record-core/record';
import type { Field, Schema } from '@fairdatateam/record-core/types';
import type { EntityType } from './profile';
import { norm, type Sheet, type SheetRow } from './spreadsheet';
import { NS } from './vocab';
import { generatedPaths } from './wiring';

const DPV = 'https://w3id.org/dpv#';
const ODRL = 'http://www.w3.org/ns/odrl/2/';

/** SPEC §4.4. The licence the template prescribes when none is given. */
export const EJP_DEFAULT_LICENSE = 'https://w3id.org/ejp-rd/resources/licenses/v1.0/';
export const VP_DISCOVERABLE = `${NS.ejp}VPDiscoverable`;
export const VP_INVISIBLE = `${NS.ejp}VPInvisible`;
/** The template's own (outdated) VP terms, read as the ERDERA shapes' terms. */
const PURL_VP: Record<string, string> = {
  'http://purl.org/ejp-rd/vocabulary/VPDiscoverable': VP_DISCOVERABLE,
  'http://purl.org/ejp-rd/vocabulary/VPInvisible': VP_INVISIBLE,
};
export const ISO_639_1 = 'http://id.loc.gov/vocabulary/iso639-1/';
export const IANA_MEDIA_TYPES = 'http://www.iana.org/assignments/media-types/';
export const POPULATION_COVERAGE = ['National', 'International', 'Regional', 'European'];
/** The value the ERDERA dataset shape demands for `dpv:hasPersonalData` (sh:hasValue). */
export const DPV_HEALTH_DATA = `${DPV}HealthData`;

/** The template's resource sheets and the profile type each row becomes (SPEC §4.4). */
export const RESOURCE_SHEETS: Record<string, string> = {
  Catalog: 'catalog',
  Dataset: 'dataset',
  Distribution: 'distribution',
  PatientRegistry: 'patientregistry',
  Biobank: 'biobank',
  Guideline: 'guideline',
  // A data service under a distribution (its AccessService) is an Access
  // Service, any other one a Data Service under a catalog.
  DataService: 'dataservice2',
};
export const ORGANISATION_SHEET = 'Organisation';
export const CONTACT_POINT_SHEET = 'ContactPoint';
/** The template's lookup lists: not resources. */
export const LOOKUP_SHEETS = ['Mediatypes', 'Languages'];
/** Sheets whose rows a catalog's Dataset column (and a service's ServesDataset) may name. */
export const DATA_SHEETS = ['Dataset', 'PatientRegistry', 'Biobank'];

export type Rule =
  | 'text'
  | 'iri'
  | 'list'
  | 'language'
  | 'license'
  | 'vp'
  | 'date'
  | 'mediaType'
  | 'personalData'
  | 'populationCoverage'
  /** Pointers, resolved after every row has an IRI. */
  | 'publisher'
  | 'contactPoint'
  | 'children'
  | 'parent'
  | 'ref'
  /** Known column, never imported. */
  | 'none';

export interface Column {
  rule: Rule;
  /** The profile field's path (expanded IRI). */
  path?: string;
  /** Sheets whose rows a pointer names. */
  targets?: string[];
}

const c = (rule: Rule, path?: string, targets?: string[]): Column => ({ rule, path, targets });

/** SPEC §4.4. Template column (normalised) → field, for every resource sheet. */
export const RESOURCE_COLUMNS: Record<string, Column> = {
  title: c('text', `${NS.dct}title`),
  description: c('text', `${NS.dct}description`),
  license: c('license', `${NS.dct}license`),
  theme: c('list', `${NS.dcat}theme`),
  keyword: c('list', `${NS.dcat}keyword`),
  language: c('language', `${NS.dct}language`),
  accessrights: c('iri', `${NS.dct}accessRights`),
  landingpage: c('iri', `${NS.dcat}landingPage`),
  logo: c('iri', `${NS.foaf}logo`),
  identifier: c('text', `${NS.dct}identifier`),
  version: c('text', `${NS.dcat}version`),
  conformsto: c('iri', `${NS.dct}conformsTo`),
  odrlpolicy: c('iri', `${ODRL}hasPolicy`),
  issued: c('date', `${NS.dct}issued`),
  modified: c('date', `${NS.dct}modified`),
  vpconnection: c('vp', `${NS.ejp}vpConnection`),
  personaldata: c('personalData', `${DPV}hasPersonalData`),
  populationcoverage: c('populationCoverage', `${NS.ejp}populationCoverage`),
  homepage: c('iri', `${NS.foaf}homePage`),
  themetaxonomy: c('iri', `${NS.dcat}themeTaxonomy`),
  type: c('iri', `${NS.dct}type`),
  endpointdescription: c('iri', `${NS.dcat}endpointDescription`),
  endpointurl: c('iri', `${NS.dcat}endpointURL`),
  mediatype: c('mediaType', `${NS.dct}format`),
  publisher: c('publisher', `${NS.dct}publisher`, [ORGANISATION_SHEET]),
  contactpoint: c('contactPoint', `${NS.dcat}contactPoint`, [CONTACT_POINT_SHEET]),
  servesdataset: c('ref', `${NS.dcat}servesDataset`, DATA_SHEETS),
  dataset: c('children', undefined, DATA_SHEETS),
  distribution: c('children', undefined, ['Distribution']),
  accessservice: c('children', undefined, ['DataService']),
  ispartof: c('parent', undefined, ['Dataset']),
};

/** Columns that mean something else on one sheet. */
const SHEET_COLUMNS: Record<string, Record<string, Column>> = {
  // Access or Download: how the (absent) URL works, not a dct:type.
  Distribution: { type: c('none') },
};

/** SPEC §4.4. Organisation rows fill the nested publisher (foaf:Organization). */
export const ORGANISATION_COLUMNS: Record<string, Column> = {
  title: c('text', `${NS.foaf}name`),
  description: c('text', `${NS.dct}description`),
  landingpage: c('iri', `${NS.dcat}landingPage`),
  logo: c('iri', `${NS.foaf}logo`),
  location: c('none'),
  identifier: c('none'),
};

export const CONTACT_POINT_COLUMNS: Record<string, Column> = { url: c('iri', `${NS.vcard}url`) };

export function columnOf(sheet: string, header: string): Column | undefined {
  const key = norm(header);
  return SHEET_COLUMNS[sheet]?.[key] ?? RESOURCE_COLUMNS[key];
}

// ---------- value rules (SPEC §4.4) ----------

/** Theme and Keyword: split on `|` when the cell has one, else on `,`. */
export function splitList(cell: string): string[] {
  return cell
    .split(cell.includes('|') ? '|' : ',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** An ISO 639-1 code becomes its id.loc.gov IRI; anything else stays as it is. */
export function languageIri(cell: string): string {
  const v = cell.trim();
  return /^[a-z]{2}$/i.test(v) ? ISO_639_1 + v.toLowerCase() : v;
}

/** The template's purl.org VP terms are the ERDERA shapes' w3id terms. Empty: VPDiscoverable. */
export function vpConnectionIri(cell: string): { value: string; defaulted: boolean } {
  const v = cell.trim();
  if (!v) return { value: VP_DISCOVERABLE, defaulted: true };
  return { value: PURL_VP[v] ?? v, defaulted: false };
}

/** Empty: the EJP RD licence the template prescribes. */
export function licenseIri(cell: string): { value: string; defaulted: boolean } {
  const v = cell.trim();
  return v ? { value: v, defaulted: false } : { value: EJP_DEFAULT_LICENSE, defaulted: true };
}

/**
 * The template's Issued / Modified are dates, the ERDERA shapes want
 * xsd:dateTime: a date becomes midnight of that day, without a time zone
 * (a date carries none either). Anything else stays as it is.
 */
export function dateTimeOf(cell: string): string {
  const v = cell.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v;
}

/** A media type (`text/csv`) becomes its IANA IRI; a full IRI stays. */
export function mediaTypeIri(cell: string): string {
  const v = cell.trim();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(v) && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? IANA_MEDIA_TYPES + v.toLowerCase() : v;
}

/** `true` or `false`, any case; null for anything else. */
export function personalDataOf(cell: string): boolean | null {
  const v = cell.trim().toLowerCase();
  return v === 'true' ? true : v === 'false' ? false : null;
}

/** One of the four the shape lists, in its spelling; anything else stays (and is flagged). */
export function populationCoverageOf(cell: string): string {
  const v = cell.trim();
  return POPULATION_COVERAGE.find((x) => x.toLowerCase() === v.toLowerCase()) ?? v;
}

// ---------- filling form values ----------

const pathOfField = (form: Schema, f: Field) => expandTerm(f.path, form.prefixes);

/** The form's top-level field for a path. */
export function fieldFor(form: Schema, path: string): Field | undefined {
  return shapeFields(form).find((f) => !f.inversePath && pathOfField(form, f) === path);
}

/** A value as an `sh:in` drop-down stores it, when the list has it. */
function listed(form: Schema, f: Field, value: string): string {
  const hit = f.inValues?.find((iv) => iv.value === value || (iv.kind === 'iri' && expandTerm(iv.value, form.prefixes) === value));
  return hit ? hit.value : value;
}

/** Set a field of `node` to `values` (plain literals or IRIs, as the field says). */
function put(form: Schema, node: RecordNode, f: Field, values: string[]): void {
  node[fieldKey(f)] = values.map((v) => ({ value: listed(form, f, v), lang: '' }));
}

/** SPEC §4.4. Fill the top-level field for `path`; false when the form has none. */
export function setField(form: Schema, node: RecordNode, path: string, values: string[]): boolean {
  const f = fieldFor(form, path);
  if (!f || f.widgetId === 'DetailsEditor') return false;
  put(form, node, f, values);
  return true;
}

/**
 * SPEC §4.4. Fill the nested node of the field for `path` (publisher,
 * contact point, population coverage): `inner` maps nested paths to values.
 * False when the form has no such sub-form.
 */
export function setNested(form: Schema, node: RecordNode, path: string, inner: Record<string, string[]>): boolean {
  const f = fieldFor(form, path);
  const ns = f && nestedShapeOf(form, f);
  if (!f || !ns) return false;
  const nested = normalizeNode(form, nestedFieldsOf(ns), {}, 1);
  for (const nf of nestedFieldsOf(ns)) {
    const p = pathOfField(form, nf);
    if (p && inner[p]?.length) put(form, nested, nf, inner[p]);
  }
  node[fieldKey(f)] = [{ value: '', lang: '', node: nested }];
  return true;
}

/** Whether the form has a field (or sub-form) for `path`. */
export const hasField = (form: Schema, path: string): boolean => !!fieldFor(form, path);

// ---------- one row ----------

export interface Pointer {
  column: string;
  rule: 'publisher' | 'contactPoint' | 'children' | 'parent' | 'ref';
  path?: string;
  targets: string[];
  values: string[];
}

export interface MappedRow {
  sheet: string;
  row: number;
  title: string;
  values: RecordNode;
  pointers: Pointer[];
  /** Columns filled with a default because the cell was empty. */
  defaults: { column: string; value: string }[];
  /** Cells with a value that no field takes. */
  notMapped: { column: string; why: 'noField' | 'generated' | 'never' }[];
  /** Cells whose value the template does not allow, with no field to flag them. */
  invalid: { column: string; value: string }[];
}

/** A row's cells by column, both ConformsTo columns of DataService included. */
export function cellsOf(sheet: Sheet, row: SheetRow): { header: string; value: string }[] {
  return sheet.header.map((header, i) => ({ header, value: (row.cells[i] ?? '').trim() }));
}

/**
 * SPEC §4.4. The template pre-fills row 2 of every resource sheet with only
 * VPConnection: such a row is not a resource.
 */
export function isPrefilled(sheet: Sheet, row: SheetRow): boolean {
  const filled = cellsOf(sheet, row).filter((x) => x.value);
  return filled.length === 1 && norm(filled[0].header) === 'vpconnection';
}

/**
 * SPEC §4.4. One resource row as form values of `type`, plus the pointers
 * still to resolve. Unknown columns are left to the caller (`columnOf`).
 */
export function mapRow(sheet: Sheet, row: SheetRow, type: EntityType, form: Schema): MappedRow {
  const values = normalizeRecord(form, {});
  const out: MappedRow = { sheet: sheet.name, row: row.n, title: '', values, pointers: [], defaults: [], notMapped: [], invalid: [] };
  const generated = new Set(generatedPaths(type));
  // Columns that appear twice (DataService's ConformsTo) pool their values.
  const byColumn = new Map<string, { header: string; column: Column; values: string[] }>();
  for (const { header, value } of cellsOf(sheet, row)) {
    const column = header ? columnOf(sheet.name, header) : undefined;
    if (!column) continue;
    const key = norm(header);
    const entry = byColumn.get(key) ?? { header, column, values: [] };
    if (value) entry.values.push(value);
    byColumn.set(key, entry);
  }

  for (const { header, column, values: cells } of byColumn.values()) {
    const cell = cells.join(', ');
    const { rule, path } = column;
    if (rule === 'none') {
      if (cells.length) out.notMapped.push({ column: header, why: 'never' });
      continue;
    }
    if (rule === 'publisher' || rule === 'contactPoint' || rule === 'children' || rule === 'parent' || rule === 'ref') {
      if (cells.length) out.pointers.push({ column: header, rule, path, targets: column.targets ?? [], values: rule === 'publisher' || rule === 'contactPoint' ? cells : cells.flatMap(splitList) });
      continue;
    }
    // Defaults apply only where the form has the field.
    if (!path || !hasField(form, path)) {
      if (rule === 'personalData' && cells.length && cells.some((v) => personalDataOf(v) === null))
        out.invalid.push({ column: header, value: cell });
      if (cells.length) out.notMapped.push({ column: header, why: path && generated.has(path) ? 'generated' : 'noField' });
      continue;
    }
    switch (rule) {
      case 'text':
        if (cells.length) setField(form, values, path, cells);
        if (path === `${NS.dct}title`) out.title = cells[0] ?? '';
        break;
      case 'iri':
        if (cells.length) setField(form, values, path, cells);
        break;
      case 'list':
        if (cells.length) setField(form, values, path, cells.flatMap(splitList));
        break;
      case 'language':
        if (cells.length) setField(form, values, path, cells.flatMap(splitList).map(languageIri));
        break;
      case 'date':
        if (cells.length) setField(form, values, path, cells.map(dateTimeOf));
        break;
      case 'mediaType':
        if (cells.length) setField(form, values, path, cells.map(mediaTypeIri));
        break;
      case 'license':
      case 'vp': {
        const rule1 = rule === 'license' ? licenseIri : vpConnectionIri;
        if (!cells.length) {
          const r = rule1('');
          out.defaults.push({ column: header, value: r.value });
          setField(form, values, path, [r.value]);
        } else setField(form, values, path, cells.map((v) => rule1(v).value));
        break;
      }
      case 'personalData': {
        // ERDERA's dataset shape asks "Personal Data?" with the one value
        // dpv:HealthData: true sets it; false leaves it empty, and the shape
        // flags it.
        const flags = cells.map(personalDataOf);
        if (flags.some((x) => x === null)) out.invalid.push({ column: header, value: cell });
        else if (flags.includes(true)) setField(form, values, path, [DPV_HEALTH_DATA]);
        break;
      }
      case 'populationCoverage':
        if (cells.length) setNested(form, values, path, { [`${NS.rdfs}label`]: cells.map(populationCoverageOf) });
        break;
    }
  }
  return out;
}

/** SPEC §4.4. An Organisation row as the nested publisher's values, by path. */
export function organisationValues(sheet: Sheet, row: SheetRow): { name: string; inner: Record<string, string[]>; notMapped: string[] } {
  const inner: Record<string, string[]> = {};
  const notMapped: string[] = [];
  let name = '';
  for (const { header, value } of cellsOf(sheet, row)) {
    const column = ORGANISATION_COLUMNS[norm(header)];
    if (!column || !value) continue;
    if (column.rule === 'none' || !column.path) {
      notMapped.push(header);
      continue;
    }
    inner[column.path] = [...(inner[column.path] ?? []), value];
    if (norm(header) === 'title') name = value;
  }
  return { name, inner, notMapped };
}
