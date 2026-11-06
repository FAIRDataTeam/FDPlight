// Import the ERDERA resource metadata spreadsheet into a project with the
// ERDERA profile (SPEC §4.4). Each data row of a resource sheet becomes one
// record under the project's existing root: every row gets an IRI first,
// then references to other rows (by title, or by URL for contact points)
// are replaced by the target row's record. Nothing downstream changes: the
// result is entities plus form values, as if the user had typed them.

import { slugify, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { filePath, isValidId } from './iri';
import { say } from './messages';
import { typeByKey, type EntityType } from './profile';
import { iriOf, pathOf, rootPath, type Entity, type Project } from './project';
import { norm, TEMPLATE_SHEETS, type Sheet, type SheetRow } from './spreadsheet';
import {
  cellsOf,
  columnOf,
  CONTACT_POINT_COLUMNS,
  CONTACT_POINT_SHEET,
  EJP_DEFAULT_LICENSE,
  isPrefilled,
  LOOKUP_SHEETS,
  mapRow,
  ORGANISATION_COLUMNS,
  ORGANISATION_SHEET,
  organisationValues,
  RESOURCE_SHEETS,
  setField,
  setNested,
  VP_DISCOVERABLE,
  type MappedRow,
  type Pointer,
} from './spreadsheetMap';
import { NS } from './vocab';

/** SPEC §4.4. Title of the catalog for records with no catalog and no publisher (metadata, so not translated). */
export const NO_PUBLISHER_CATALOG = 'Resources without a publisher';

/** The profile types the import fills (SPEC §3.2 ERDERA). */
export const SPREADSHEET_TYPES = ['catalog', 'dataset', 'distribution', 'patientregistry', 'biobank', 'guideline', 'dataservice', 'dataservice2'];

export interface SpreadsheetReport {
  /** Rows read per sheet. */
  sheets: string[];
  /** Records created, in tree order. */
  created: string[];
  /** Where records went when the sheet did not say, or could not. */
  placed: string[];
  /** References to rows that do not exist. */
  unresolved: string[];
  /** Empty cells given the template's default. */
  defaults: string[];
  /** Columns, sheets and values that no field takes. */
  notMapped: string[];
  /** Titles used more than once. */
  duplicates: string[];
}

export interface SpreadsheetImportInput {
  sheets: Sheet[];
  /** The project to add to; it must use the ERDERA profile. */
  project: Project;
  forms: Record<string, Schema>;
}

export type SpreadsheetImportResult =
  | { ok: true; entities: Entity[]; values: Record<string, RecordNode>; use?: string[]; report: SpreadsheetReport }
  | { ok: false; error: string };

/** SPEC §4.4. Whether the project's profile has every type the import fills. */
export function canImportSpreadsheet(types: EntityType[]): boolean {
  return SPREADSHEET_TYPES.every((k) => types.some((t) => t.key === k));
}

/** SPEC §4.4. Titles match after trimming, case- and white-space-insensitively. */
const titleKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

interface Resource {
  sheet: string;
  row: number;
  /** Where it came from; none for a catalog the import adds. */
  source?: { sheet: Sheet; row: SheetRow };
  type: string;
  title: string;
  mapped: MappedRow;
  parent?: Resource | null; // null: the project's root
  entity?: Entity;
}

interface Organisation {
  row: number;
  name: string;
  inner: Record<string, string[]>;
}

/** The template sheet a sheet name means, or undefined. */
const templateSheet = (name: string) => TEMPLATE_SHEETS.find((t) => norm(t) === norm(name));

/** "A1"-style column letter, for columns without a header. */
function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** SPEC §4.4. The records of `sheets`, to add under the project's root. */
export function importSpreadsheet(input: SpreadsheetImportInput): SpreadsheetImportResult {
  const { project, forms } = input;
  if (!canImportSpreadsheet(project.types)) return { ok: false, error: say('sheetNeedsErdera') };
  const report: SpreadsheetReport = { sheets: [], created: [], placed: [], unresolved: [], defaults: [], notMapped: [], duplicates: [] };
  const typeName = (key: string) => typeByKey(project.types, key).name;

  // ---- sheets ----
  const byTemplate = new Map<string, Sheet>();
  for (const s of input.sheets) {
    const t = templateSheet(s.name);
    if (!t) report.notMapped.push(say('sheetUnknownSheet', { sheet: s.name, n: s.rows.length }));
    else if (LOOKUP_SHEETS.includes(t)) report.sheets.push(say('sheetLookup', { sheet: s.name }));
    else byTemplate.set(t, s);
  }
  if (![...byTemplate.keys()].some((t) => t in RESOURCE_SHEETS)) return { ok: false, error: say('sheetNoResources') };

  /** Columns of a sheet the template does not have, with values. */
  const unknownColumns = (s: Sheet, known: (header: string) => boolean) => {
    s.header.forEach((h, i) => {
      if (h && known(h)) return;
      const n = s.rows.filter((r) => (r.cells[i] ?? '').trim()).length;
      if (h || n) report.notMapped.push(say('sheetUnknownColumn', { sheet: s.name, column: h || columnLetter(i), n }));
    });
  };

  // ---- organisations and contact points ----
  const organisations = new Map<string, Organisation>();
  const orgSheet = byTemplate.get(ORGANISATION_SHEET);
  if (orgSheet) {
    unknownColumns(orgSheet, (h) => norm(h) in ORGANISATION_COLUMNS);
    const notMapped = new Map<string, number>();
    for (const row of orgSheet.rows) {
      const o = organisationValues(orgSheet, row);
      for (const c of o.notMapped) notMapped.set(c, (notMapped.get(c) ?? 0) + 1);
      const key = titleKey(o.name);
      if (!key) continue;
      const first = organisations.get(key);
      if (first) report.duplicates.push(say('sheetDuplicate', { title: o.name, sheet: ORGANISATION_SHEET, row: row.n, firstSheet: ORGANISATION_SHEET, firstRow: first.row }));
      else organisations.set(key, { row: row.n, name: o.name, inner: o.inner });
    }
    for (const [column, n] of notMapped) report.notMapped.push(say('sheetNotMappedNever', { sheet: orgSheet.name, column, n }));
    report.sheets.push(say('sheetRows', { sheet: orgSheet.name, n: orgSheet.rows.length }));
  }

  const contactPoints = new Set<string>();
  const cpSheet = byTemplate.get(CONTACT_POINT_SHEET);
  if (cpSheet) {
    unknownColumns(cpSheet, (h) => norm(h) in CONTACT_POINT_COLUMNS);
    for (const row of cpSheet.rows) for (const { header, value } of cellsOf(cpSheet, row)) if (norm(header) === 'url' && value) contactPoints.add(value);
    report.sheets.push(say('sheetRows', { sheet: cpSheet.name, n: cpSheet.rows.length }));
  }

  // ---- resource rows (template order, so the workbook and the TSV files agree) ----
  const resources: Resource[] = [];
  for (const t of TEMPLATE_SHEETS) {
    const s = byTemplate.get(t);
    const type = RESOURCE_SHEETS[t];
    if (!s || !type) continue;
    unknownColumns(s, (h) => !!columnOf(t, h));
    let prefilled = 0;
    for (const row of s.rows) {
      if (isPrefilled(s, row)) {
        prefilled++;
        continue;
      }
      const source = { sheet: { ...s, name: t }, row };
      const mapped = mapRow(source.sheet, row, typeByKey(project.types, type), forms[type]);
      resources.push({ sheet: t, row: row.n, source, type, title: mapped.title, mapped });
    }
    const n = s.rows.length - prefilled;
    report.sheets.push(prefilled ? say('sheetRowsPrefilled', { sheet: s.name, n, skipped: prefilled }) : say('sheetRows', { sheet: s.name, n }));
  }

  // Titles must be unique in the spreadsheet: the first one wins.
  const byTitle = new Map<string, Resource>();
  for (const r of resources) {
    const key = titleKey(r.title);
    const first = byTitle.get(key);
    if (!key) continue;
    if (!first) byTitle.set(key, r);
    else report.duplicates.push(say('sheetDuplicate', { title: r.title, sheet: r.sheet, row: r.row, firstSheet: first.sheet, firstRow: first.row }));
  }

  const label = (r: Resource) => r.title || `${r.sheet} row ${r.row}`;
  const pointersOf = (r: Resource, rule: Pointer['rule']) => r.mapped.pointers.filter((p) => p.rule === rule);
  /** The row a pointer value names, or undefined (reported). */
  const resolve = (from: Resource, p: Pointer, value: string): Resource | undefined => {
    const hit = byTitle.get(titleKey(value));
    if (hit && p.targets.includes(hit.sheet)) return hit;
    report.unresolved.push(say('sheetUnresolved', { sheet: from.sheet, row: from.row, column: p.column, value, targets: p.targets.join(' / ') }));
    return undefined;
  };
  const listedTwice = (child: Resource, second: Resource) => {
    if (child.parent && child.parent !== second)
      report.placed.push(say('sheetListedTwice', { title: label(child), first: label(child.parent), second: label(second) }));
  };

  // ---- the tree: parents' lists first, then IsPartOf (as SPEC §4.1, the parent's list wins) ----
  for (const r of resources) {
    if (r.type === 'catalog') r.parent = null;
    if (r.sheet === 'Distribution') continue; // its AccessService: below
    for (const p of pointersOf(r, 'children')) {
      for (const v of p.values) {
        const child = resolve(r, p, v);
        if (!child) continue;
        const fits = typeByKey(project.types, r.type).children.some((c) => c.type === child.type);
        if (!fits) continue; // reported below
        if (child.parent === undefined) child.parent = r;
        else listedTwice(child, r);
      }
    }
  }
  for (const r of resources.filter((x) => x.sheet === 'Distribution')) {
    for (const p of pointersOf(r, 'parent')) {
      for (const v of p.values) {
        const parent = resolve(r, p, v);
        if (!parent) continue;
        if (r.parent === undefined) r.parent = parent;
        else if (r.parent !== parent)
          report.placed.push(say('sheetIsPartOfDiffers', { title: label(r), list: label(r.parent!), isPartOf: label(parent) }));
      }
    }
  }
  // Lists the profile has no place for: distributions of anything but a dataset.
  for (const r of resources) {
    if (r.type === 'dataset') continue;
    for (const p of pointersOf(r, 'children').filter((x) => x.targets.includes('Distribution')))
      for (const v of p.values) {
        const d = byTitle.get(titleKey(v));
        if (d?.sheet === 'Distribution') report.placed.push(say('sheetNoPlace', { sheet: r.sheet, title: label(r), column: p.column, target: label(d), type: typeName(r.type).toLowerCase() }));
      }
  }
  const distributions = resources.filter((r) => r.sheet === 'Distribution');
  for (const d of distributions.filter((x) => !x.parent)) report.placed.push(say('sheetNoDataset', { title: label(d), row: d.row }));
  // A data service a distribution names as its AccessService is that distribution's Access Service.
  for (const d of distributions) {
    for (const p of pointersOf(d, 'children')) {
      for (const v of p.values) {
        const svc = resolve(d, p, v);
        if (!svc || !d.parent) continue;
        if (svc.parent === undefined) {
          svc.parent = d;
          svc.type = 'dataservice';
        } else listedTwice(svc, d);
      }
    }
  }

  // ---- resources no catalog lists: a catalog named after their organisation ----
  const catalogs = resources.filter((r) => r.type === 'catalog');
  const added: Resource[] = [];
  const unlisted = new Map<string, Resource[]>();
  for (const r of resources) {
    if (r.parent !== undefined || r.type === 'distribution') continue;
    const cell = pointersOf(r, 'publisher')[0]?.values[0] ?? '';
    const org = organisations.get(titleKey(cell));
    const name = org?.name ?? (cell.trim() || NO_PUBLISHER_CATALOG);
    unlisted.set(name, [...(unlisted.get(name) ?? []), r]);
  }
  for (const [name, list] of unlisted) {
    let home = catalogs.find((c) => titleKey(c.title) === titleKey(name));
    if (!home) {
      home = { sheet: 'Catalog', row: 0, type: 'catalog', title: name, parent: null, mapped: addedCatalog(name, project, forms.catalog, organisations.get(titleKey(name))) };
      added.push(home);
      report.defaults.push(say('sheetDefaultAdded', { title: name, column: 'License', value: EJP_DEFAULT_LICENSE }));
      report.defaults.push(say('sheetDefaultAdded', { title: name, column: 'VPConnection', value: VP_DISCOVERABLE }));
    }
    for (const r of list) r.parent = home;
    report.placed.push(say('sheetOrgCatalog', { catalog: name, titles: list.map((r) => `${typeName(r.type)} “${label(r)}”`).join(', ') }));
  }

  // ---- an IRI for every record before any reference is filled in ----
  const imported = [...catalogs, ...added, ...resources.filter((r) => r.type !== 'catalog' && r.parent)];
  const taken = new Set(project.entities.map((e) => pathOf(project, e)));
  const root = rootPath(project);
  const scratch: Project = { ...project, entities: [...project.entities] };
  for (const r of imported) {
    const prefix = typeByKey(project.types, r.type).urlPrefix;
    // SPEC §2.3: a readable slug of the title, unique within the project.
    const base = isValidId(slugify(r.title)) ? slugify(r.title) : r.type;
    let id = base;
    for (let n = 2; taken.has(filePath(prefix, id)); n++) id = `${base}-${n}`;
    taken.add(filePath(prefix, id));
    r.entity = { type: r.type, id, parent: null };
  }
  for (const r of imported) r.entity!.parent = r.parent ? pathOf(project, r.parent.entity!) : root;
  scratch.entities.push(...imported.map((r) => r.entity!));
  const iri = (r: Resource) => iriOf(scratch, r.entity!);

  // ---- references → records ----
  const values: Record<string, RecordNode> = {};
  const defaults = new Map<string, { sheet: string; column: string; value: string; n: number }>();
  const notMapped = new Map<string, { sheet: string; column: string; why: string; type: string; n: number }>();
  for (const r of imported) {
    const form = forms[r.type];
    // A data service that became an Access Service is mapped with that type's form.
    const m = r.source && r.type !== RESOURCE_SHEETS[r.sheet] ? mapRow(r.source.sheet, r.source.row, typeByKey(project.types, r.type), form) : r.mapped;
    for (const d of m.defaults) {
      const k = `${r.sheet}\u0000${d.column}\u0000${d.value}`;
      defaults.set(k, { sheet: r.sheet, column: d.column, value: d.value, n: (defaults.get(k)?.n ?? 0) + 1 });
    }
    for (const x of m.notMapped) {
      const k = `${r.sheet}\u0000${x.column}\u0000${x.why}\u0000${r.type}`;
      notMapped.set(k, { sheet: r.sheet, column: x.column, why: x.why, type: typeName(r.type), n: (notMapped.get(k)?.n ?? 0) + 1 });
    }
    for (const x of m.invalid) report.notMapped.push(say('sheetNotTrueFalse', { sheet: r.sheet, row: r.row, column: x.column, value: x.value }));

    for (const p of m.pointers) {
      if (p.rule === 'publisher') {
        const org = organisations.get(titleKey(p.values[0]));
        if (org) setNested(form, m.values, p.path!, org.inner);
        else report.unresolved.push(say('sheetUnresolved', { sheet: r.sheet, row: r.row, column: p.column, value: p.values[0], targets: ORGANISATION_SHEET }));
      } else if (p.rule === 'contactPoint') {
        // The contact point is its URL: fill it in even when the ContactPoint sheet lacks it.
        if (!contactPoints.has(p.values[0]))
          report.unresolved.push(say('sheetContactNotListed', { sheet: r.sheet, row: r.row, column: p.column, value: p.values[0] }));
        setNested(form, m.values, p.path!, { [`${NS.vcard}url`]: [p.values[0]] });
      } else if (p.rule === 'ref') {
        const targets = p.values.map((v) => resolve(r, p, v)).filter((t): t is Resource => !!t?.entity);
        if (targets.length) setField(form, m.values, p.path!, targets.map(iri));
      }
    }
    values[pathOf(project, r.entity!)] = m.values;
  }
  for (const d of defaults.values()) report.defaults.push(say('sheetDefault', { sheet: d.sheet, column: d.column, value: d.value, n: d.n }));
  for (const x of notMapped.values())
    report.notMapped.push(
      say(x.why === 'generated' ? 'sheetNotMappedGenerated' : x.why === 'never' ? 'sheetNotMappedNever' : 'sheetNotMapped', { sheet: x.sheet, column: x.column, n: x.n, type: x.type }),
    );

  // ---- entities in tree order: siblings by title, then id (as SPEC §4.1) ----
  const entities: Entity[] = [];
  const visit = (parent: Resource | null) =>
    imported
      .filter((r) => (r.parent ?? null) === parent)
      .sort((a, b) => a.title.localeCompare(b.title) || a.entity!.id.localeCompare(b.entity!.id))
      .forEach((r) => {
        entities.push(r.entity!);
        const where = r.parent ? say('sheetCreatedIn', { type: typeName(r.type), title: label(r), path: pathOf(project, r.entity!), parent: label(r.parent) }) : say('sheetCreated', { type: typeName(r.type), title: label(r), path: pathOf(project, r.entity!) });
        report.created.push(where);
        visit(r);
      });
  visit(null);

  const usedTypes = new Set(entities.map((e) => e.type));
  const use = project.use ? project.types.map((t) => t.key).filter((k) => project.use!.includes(k) || usedTypes.has(k)) : undefined;
  return { ok: true, entities, values, use, report };
}

/** SPEC §4.4. The catalog added for an organisation's unlisted records: its name, publisher, licence, VP default. */
function addedCatalog(name: string, project: Project, form: Schema, org: Organisation | undefined): MappedRow {
  const sheet: Sheet = { name: 'Catalog', header: ['Title', 'License', 'VPConnection'], rows: [{ n: 0, cells: [name, '', ''] }] };
  const m = mapRow(sheet, sheet.rows[0], typeByKey(project.types, 'catalog'), form);
  if (org) setNested(form, m.values, `${NS.dct}publisher`, org.inner);
  return { ...m, defaults: [], row: 0 };
}

