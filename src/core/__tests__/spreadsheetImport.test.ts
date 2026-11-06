// Importing the ERDERA resource metadata spreadsheet (SPEC §4.4): fixture 1 of
// the ERDERA D11 demonstrator end to end, and the pointer resolver.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import { Parser, Store } from 'n3';
import { newProject } from '../../composables/useProject';
import { ERDERA } from '../../profiles/erdera';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm, userGraphFromForm } from '../forms';
import { iriOf, pathOf, stamp, type Project } from '../project';
import { readSpreadsheet, type Sheet, type SheetFile } from '../spreadsheet';
import { importSpreadsheet, type SpreadsheetImportResult } from '../spreadsheetImport';
import { checkEntity, shapesGraph, type ShaclFinding } from '../validation';
import { serializeEntity, toTurtle } from '../wiring';

const dir = fileURLToPath(new URL('./fixtures/synthetic-registry/', import.meta.url));
const forms = Object.fromEntries(ERDERA.types.map((t) => [t.key, entityForm(t, ERDERA.shapes[t.key])]));
const shapes = Object.fromEntries(ERDERA.types.map((t) => [t.key, shapesGraph(ERDERA.shapes[t.key])]));
const NOW = new Date('2026-11-06T12:00:00Z');
const BASE = 'https://erdera.github.io/my-fdp/';
const TSV = ['Organisation', 'ContactPoint', 'PatientRegistry', 'Catalog'];

const erderaProject = (): Project => newProject(BASE, ERDERA);
const bytes = (name: string) => new Uint8Array(readFileSync(dir + name));
const tsvFiles = (edit: (name: string, text: string) => string = (_, t) => t): SheetFile[] =>
  TSV.map((s) => ({ name: `${s}.tsv`, data: new TextEncoder().encode(edit(s, readFileSync(`${dir}${s}.tsv`, 'utf8'))) }));

function sheetsOf(files: SheetFile[]): Sheet[] {
  const r = readSpreadsheet(files);
  if (!r.ok) throw new Error(r.error);
  return r.sheets;
}

function run(sheets: Sheet[], project = erderaProject()) {
  const r = importSpreadsheet({ sheets, project, forms });
  if (!r.ok) throw new Error(r.error);
  const p: Project = { ...project, entities: [...project.entities, ...r.entities], use: r.use };
  const values: Record<string, RecordNode> = { [pathOf(p, p.entities[0])]: normalizeRecord(forms.fdp, {}), ...r.values };
  return { r, p, values };
}

/** As the app does: each entity's full file graph, its SHACL findings and its Turtle. */
async function files(p: Project, values: Record<string, RecordNode>, paths: string[]) {
  const out = new Map<string, { turtle: string; errors: ShaclFinding[]; graph: Store }>();
  for (const path of paths) {
    const e = p.entities.find((x) => pathOf(p, x) === path)!;
    const iri = iriOf(p, e);
    const graph = serializeEntity(p, stamp(e, NOW), userGraphFromForm(forms[e.type], iri, values[path]));
    const findings = await checkEntity(forms[e.type], iri, values[path], graph, shapes[e.type]);
    out.set(path, { turtle: await toTurtle(graph, iri), errors: findings.filter((f) => f.severity === 'error'), graph });
  }
  return out;
}

const REGISTRY = 'patientregistry/synthetic-cakut-patient-registry.ttl';
const CATALOG = 'catalog/synthetic-rkpa-resources.ttl';

describe('spreadsheet import: fixture 1, a synthetic patient registry (SPEC §4.4)', () => {
  it('imports the workbook with no red counts: the registry under its catalog, publisher and contact point filled', async () => {
    const { r, p, values } = run(sheetsOf([{ name: 'synthetic-registry.xlsx', data: bytes('synthetic-registry.xlsx') }]));
    expect(r.entities).toEqual([
      { type: 'catalog', id: 'synthetic-rkpa-resources', parent: 'fdp.ttl' },
      { type: 'patientregistry', id: 'synthetic-cakut-patient-registry', parent: CATALOG },
    ]);
    // The registry type is put in use; the root's metadata is not touched.
    expect(r.use).toEqual(['catalog', 'dataset', 'distribution', 'patientregistry']);
    expect(Object.keys(r.values)).toEqual([CATALOG, REGISTRY]);

    const out = await files(p, values, [CATALOG, REGISTRY]);
    expect(out.get(CATALOG)!.errors).toEqual([]);
    expect(out.get(REGISTRY)!.errors).toEqual([]);

    const reg = out.get(REGISTRY)!.turtle;
    const cat = out.get(CATALOG)!.turtle;
    expect(cat).toContain(`dct:hasPart <${BASE}${REGISTRY}>`);
    expect(reg).toContain(`dct:isPartOf <${BASE}${CATALOG}>`);
    // Publisher from the Organisation row, contact point from its URL.
    for (const ttl of [reg, cat]) {
      expect(ttl).toMatch(/dct:publisher <[^>]+#publisher>/);
      expect(ttl).toContain('foaf:name "SYNTHETIC Rare Kidney Patient Alliance"');
      expect(ttl).toContain('dcat:landingPage <https://example.org/synthetic-rkpa>');
      expect(ttl).toContain('vcard:url <mailto:registry@example.org>');
      expect(ttl).toContain('dct:language <http://id.loc.gov/vocabulary/iso639-1/en>');
      expect(ttl).toContain('dcat:theme <http://www.orpha.net/ORDO/Orphanet_93545>');
    }
    // VPConnection: empty on the registry, the template's purl term on the catalog.
    expect(reg).toContain('ejp:vpConnection ejp:VPDiscoverable');
    expect(cat).toContain('ejp:vpConnection ejp:VPDiscoverable');
    expect(cat).not.toContain('purl.org/ejp-rd');
    // Keywords split on | (registry) and on commas (catalog).
    expect(reg).toMatch(/dcat:keyword "CAKUT", "patient registry", "synthetic"|dcat:keyword "CAKUT", "synthetic", "patient registry"/);
    expect(cat).toMatch(/dcat:keyword "catalog", "synthetic"|dcat:keyword "synthetic", "catalog"/);
    expect(reg).toContain('"2026-11-06T00:00:00"^^xsd:dateTime');
    expect(reg).toContain('ejp:populationCoverage _:b0');
    expect(reg).toMatch(/_:b0 a sio:SIO_001166;\s+rdfs:label "National"/);

    expect([...r.report.notMapped].sort()).toEqual([
      'Catalog PersonalData: 1 value(s) not imported; the ERDERA Catalog shape has no field for it',
      'Organisation Location: 1 value(s) not imported; the ERDERA profile has no field for it',
      'PatientRegistry PersonalData: 1 value(s) not imported; the ERDERA Patient Registry shape has no field for it',
    ]);
    expect(r.report.defaults).toEqual(['PatientRegistry VPConnection: empty in 1 row(s), set to https://w3id.org/ejp-rd/vocabulary#VPDiscoverable']);
    expect(r.report.unresolved).toEqual([]);
    expect(r.report.duplicates).toEqual([]);
    expect(r.report.placed).toEqual([]);
    expect(r.report.created).toEqual([
      'Catalog “SYNTHETIC RKPA resources”: catalog/synthetic-rkpa-resources.ttl',
      'Patient Registry “SYNTHETIC CAKUT Patient Registry”: patientregistry/synthetic-cakut-patient-registry.ttl, in “SYNTHETIC RKPA resources”',
    ]);
    expect(r.report.sheets).toEqual([
      'Mediatypes: lookup list, not resources',
      'Languages: lookup list, not resources',
      'Organisation: 1 row(s)',
      'ContactPoint: 1 row(s)',
      'Biobank: 0 row(s)',
      'PatientRegistry: 1 row(s)',
      'Guideline: 0 row(s)',
      'Dataset: 0 row(s)',
      'Distribution: 0 row(s)',
      'DataService: 0 row(s)',
      'Catalog: 1 row(s)',
    ]);
  });

  it('writes Turtle that validates against the ERDERA shapes, record by record', async () => {
    const { r, p, values } = run(sheetsOf([{ name: 'synthetic-registry.xlsx', data: bytes('synthetic-registry.xlsx') }]));
    const out = await files(p, values, r.entities.map((e) => pathOf(p, e)));
    for (const [path, f] of out) {
      const e = p.entities.find((x) => pathOf(p, x) === path)!;
      const parsed = new Store(new Parser().parse(f.turtle));
      expect(parsed.size, path).toBe(f.graph.size);
      // Only the parsed file: no form values, so nothing but the Turtle is checked.
      const findings = await checkEntity(forms[e.type], iriOf(p, e), normalizeRecord(forms[e.type], {}), parsed, shapes[e.type]);
      expect(findings.filter((x) => x.severity !== 'info'), path).toEqual([]);
    }
  });

  it('imports the TSV files exactly as the workbook', async () => {
    const xlsx = run(sheetsOf([{ name: 'synthetic-registry.xlsx', data: bytes('synthetic-registry.xlsx') }]));
    const tsv = run(sheetsOf(tsvFiles()));
    expect(tsv.r.entities).toEqual(xlsx.r.entities);
    expect(tsv.r.values).toEqual(xlsx.r.values);
    const { sheets: _a, ...xlsxReport } = xlsx.r.report;
    const { sheets: _b, ...tsvReport } = tsv.r.report;
    expect(tsvReport).toEqual(xlsxReport);
    const paths = xlsx.r.entities.map((e) => pathOf(xlsx.p, e));
    const [a, b] = [await files(xlsx.p, xlsx.values, paths), await files(tsv.p, tsv.values, paths)];
    for (const path of paths) expect(b.get(path)!.turtle, path).toBe(a.get(path)!.turtle);
  });

  it('gives exactly two red counts for a dangling publisher and a bad population coverage, on those fields', async () => {
    const edit = (sheet: string, text: string) =>
      sheet === 'PatientRegistry' ? text.replace('\tSYNTHETIC Rare Kidney Patient Alliance\t', '\tSYNTHETIC Kidney Alliance\t').replace('\tNational\t', '\tWorldwide\t') : text;
    const { r, p, values } = run(sheetsOf(tsvFiles(edit)));
    const out = await files(p, values, r.entities.map((e) => pathOf(p, e)));
    expect(out.get(CATALOG)!.errors).toEqual([]);
    const errors = out.get(REGISTRY)!.errors;
    expect(errors.map((f) => [f.loc?.replace(/^.*?(publisher|populationCoverage).*$/, '$1'), f.component])).toEqual(
      expect.arrayContaining([
        ['publisher', 'MinCount'],
        ['populationCoverage', 'In'],
      ]),
    );
    expect(errors).toHaveLength(2);
    expect(r.report.unresolved).toEqual(['PatientRegistry row 2, Publisher: no Organisation titled “SYNTHETIC Kidney Alliance”']);
  });
});

/** A small spreadsheet: sheet name → rows, the first one the header. */
const book = (spec: Record<string, string[][]>): Sheet[] =>
  Object.entries(spec).map(([name, [header, ...rows]]) => ({ name, header, rows: rows.map((cells, i) => ({ n: i + 2, cells })) }));

const ORG = ['Title', 'Description', 'LandingPage'];
const RES = ['Title', 'Publisher', 'Keyword'];

describe('spreadsheet import: the pointer resolver (SPEC §4.4)', () => {
  it('puts a record no catalog lists in a catalog named after its organisation, and says so', () => {
    const { r } = run(
      book({
        Organisation: [ORG, ['Kidney Org', 'About', 'https://example.org']],
        Guideline: [RES, ['Care guideline', 'Kidney Org', 'x']],
        Biobank: [RES, ['Kidney biobank', 'Kidney Org', 'x'], ['Lone biobank', '', 'x']],
        Catalog: [[...RES, 'Dataset'], ['Main catalog', 'Kidney Org', 'x', '']],
      }),
    );
    expect(r.entities).toEqual([
      { type: 'catalog', id: 'kidney-org', parent: 'fdp.ttl' },
      { type: 'guideline', id: 'care-guideline', parent: 'catalog/kidney-org.ttl' },
      { type: 'biobank', id: 'kidney-biobank', parent: 'catalog/kidney-org.ttl' },
      { type: 'catalog', id: 'main-catalog', parent: 'fdp.ttl' },
      { type: 'catalog', id: 'resources-without-a-publisher', parent: 'fdp.ttl' },
      { type: 'biobank', id: 'lone-biobank', parent: 'catalog/resources-without-a-publisher.ttl' },
    ]);
    expect(r.report.placed).toEqual([
      'Listed by no catalog, so placed in the catalog “Kidney Org”: Biobank “Kidney biobank”, Guideline “Care guideline”',
      'Listed by no catalog, so placed in the catalog “Resources without a publisher”: Biobank “Lone biobank”',
    ]);
    expect(r.report.defaults).toContain('Catalog “Kidney Org” (added): License set to https://w3id.org/ejp-rd/resources/licenses/v1.0/');
    expect(r.use).toEqual(expect.arrayContaining(['biobank', 'guideline']));
  });

  it('reuses a catalog that already has the organisation’s name', () => {
    const { r } = run(
      book({
        Organisation: [ORG, ['Kidney Org', 'About', 'https://example.org']],
        Guideline: [RES, ['Care guideline', 'Kidney Org', 'x']],
        Catalog: [RES, ['Kidney Org', 'Kidney Org', 'x']],
      }),
    );
    expect(r.entities.map((e) => `${e.type}/${e.id} < ${e.parent}`)).toEqual(['catalog/kidney-org < fdp.ttl', 'guideline/care-guideline < catalog/kidney-org.ttl']);
    // No catalog added, so no defaults for one.
    expect(r.report.defaults.filter((x) => x.includes('(added)'))).toEqual([]);
    expect(r.report.placed).toEqual(['Listed by no catalog, so placed in the catalog “Kidney Org”: Guideline “Care guideline”']);
  });

  it('builds catalog → dataset → distribution → access service, and fills ServesDataset with the IRI', () => {
    const { r, p, values } = run(
      book({
        Dataset: [[...RES, 'Distribution'], ['Cohort', '', 'x', 'Cohort CSV | Cohort API access']],
        Distribution: [['Title', 'IsPartOf', 'AccessService'], ['Cohort CSV', '', ''], ['Cohort API access', 'Cohort', 'Cohort API'], ['Stray file', '', '']],
        DataService: [['Title', 'ServesDataset'], ['Cohort API', 'Cohort'], ['Search', 'Cohort']],
        Catalog: [['Title', 'Dataset'], ['Cat', 'Cohort']],
      }),
    );
    expect(r.entities.map((e) => `${pathOf(p, e)} < ${e.parent}`)).toEqual([
      'catalog/cat.ttl < fdp.ttl',
      'dataset/cohort.ttl < catalog/cat.ttl',
      'distribution/cohort-api-access.ttl < dataset/cohort.ttl',
      'dataservice/cohort-api.ttl < distribution/cohort-api-access.ttl',
      'distribution/cohort-csv.ttl < dataset/cohort.ttl',
      'catalog/resources-without-a-publisher.ttl < fdp.ttl',
      'dataservice2/search.ttl < catalog/resources-without-a-publisher.ttl',
    ]);
    const serves = Object.values(values['dataservice2/search.ttl']).flat().map((v) => v.value);
    expect(serves).toContain(`${BASE}dataset/cohort.ttl`);
    expect(Object.values(values['dataservice/cohort-api.ttl']).flat().map((v) => v.value)).toContain(`${BASE}dataset/cohort.ttl`);
    expect(r.report.placed).toContain('Distribution “Stray file” (row 4): no dataset lists it and its IsPartOf names none; not imported');
    expect(r.use).toEqual(['catalog', 'dataset', 'distribution', 'dataservice', 'dataservice2']);
  });

  it('reports unresolved titles, duplicates, lists that disagree and distributions with no place', () => {
    const { r } = run(
      book({
        Dataset: [[...RES, 'Distribution'], ['Cohort', '', 'x', 'File'], ['cohort ', '', 'y', ''], ['Other', '', 'x', 'File']],
        PatientRegistry: [[...RES, 'Distribution', 'ContactPoint'], ['Reg', 'Nobody', 'x', 'File', 'mailto:x@example.org']],
        Distribution: [['Title', 'IsPartOf'], ['File', 'Other']],
        Catalog: [['Title', 'Dataset'], ['Cat', 'Cohort, Reg, Missing'], ['Cat 2', 'Reg']],
      }),
    );
    expect(r.report.duplicates).toEqual(['Title “cohort” of Dataset row 3 is also used by Dataset row 2; references to it go to Dataset row 2']);
    expect(r.report.unresolved).toEqual([
      'Catalog row 2, Dataset: no Dataset / PatientRegistry / Biobank titled “Missing”',
      'PatientRegistry row 2, Publisher: no Organisation titled “Nobody”',
      'PatientRegistry row 2, ContactPoint: mailto:x@example.org is not in the ContactPoint sheet; used as it is',
    ]);
    expect(r.report.placed).toEqual([
      '“File” is listed by “Cohort” and “Other”; kept in “Cohort”',
      '“Reg” is listed by “Cat” and “Cat 2”; kept in “Cat”',
      '“File” is listed by “Cohort” but its IsPartOf names “Other”; kept in “Cohort”',
      'PatientRegistry “Reg”, Distribution: lists distribution “File”, but in the ERDERA profile only datasets have distributions, not a patient registry',
      'Listed by no catalog, so placed in the catalog “Resources without a publisher”: Dataset “cohort”, Dataset “Other”',
    ]);
  });

  it('skips empty and pre-filled rows, and reports unknown sheets and columns', () => {
    const { r } = run(
      book({
        Biobank: [['Title', 'VPConnection', 'Notes', ''], ['', 'http://purl.org/ejp-rd/vocabulary/VPDiscoverable', '', ''], ['Bank', '', 'a note', 'stray']],
        Notes: [['Anything'], ['x'], ['y']],
        Mediatypes: [['Name'], ['json']],
      }),
    );
    expect(r.entities.filter((e) => e.type === 'biobank')).toHaveLength(1);
    expect(r.report.sheets).toEqual(['Mediatypes: lookup list, not resources', 'Biobank: 1 row(s); 1 pre-filled row(s) with only VPConnection skipped']);
    expect(r.report.notMapped).toEqual([
      'Sheet “Notes” is not in the template; 2 row(s) not imported',
      'Biobank: column “Notes” is not in the template; 1 value(s) not imported',
      'Biobank: column “D” is not in the template; 1 value(s) not imported',
    ]);
  });

  it('gives imported records ids unique within the project', () => {
    const project = erderaProject();
    project.entities.push({ type: 'catalog', id: 'cat', parent: 'fdp.ttl' });
    const { r } = run(book({ Catalog: [['Title'], ['Cat'], ['Cat!'], ['Ça & co'], ['']] }), project);
    // Untitled: the type's name; the existing catalog/cat.ttl is not reused.
    expect(r.entities.map((e) => e.id).sort()).toEqual(['ca-co', 'cat-2', 'cat-3', 'catalog']);
  });

  it('needs the ERDERA profile, and a resource sheet', () => {
    const fdp = newProject(BASE, FDP_DEFAULT);
    expect(importSpreadsheet({ sheets: book({ Catalog: [['Title'], ['C']] }), project: fdp, forms }).ok).toBe(false);
    const r: SpreadsheetImportResult = importSpreadsheet({ sheets: book({ Notes: [['x']] }), project: erderaProject(), forms });
    expect(r).toEqual({ ok: false, error: 'No resource sheet of the ERDERA template found (Catalog, Dataset, PatientRegistry, …)' });
  });
});
