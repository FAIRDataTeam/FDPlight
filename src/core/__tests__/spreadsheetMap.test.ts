// The column mapper of the spreadsheet import: template column → ERDERA field,
// and the value rules (SPEC §4.4).
import { fieldKey, type RecordNode } from '@fairdatateam/record-core/record';
import { ERDERA } from '../../profiles/erdera';
import { entityForm } from '../forms';
import { typeByKey } from '../profile';
import type { Sheet } from '../spreadsheet';
import {
  columnOf,
  dateTimeOf,
  DPV_HEALTH_DATA,
  EJP_DEFAULT_LICENSE,
  fieldFor,
  isPrefilled,
  languageIri,
  licenseIri,
  mapRow,
  mediaTypeIri,
  organisationValues,
  personalDataOf,
  populationCoverageOf,
  splitList,
  VP_DISCOVERABLE,
  VP_INVISIBLE,
  vpConnectionIri,
} from '../spreadsheetMap';
import { NS } from '../vocab';

const forms = Object.fromEntries(ERDERA.types.map((t) => [t.key, entityForm(t, ERDERA.shapes[t.key])]));
const type = (key: string) => typeByKey(ERDERA.types, key);

/** Values of the field for `path`, or of its nested field `inner`. */
function valuesAt(key: string, node: RecordNode, path: string, inner?: string): string[] {
  const form = forms[key];
  const f = fieldFor(form, path)!;
  const list = node[fieldKey(f)] ?? [];
  if (!inner) return list.map((v) => v.value).filter(Boolean);
  const nested = list[0]?.node ?? {};
  const k = Object.keys(nested).find((x) => x === inner || x.endsWith(inner.replace(/^.*[#/]/, ''))) ?? '';
  return (nested[k] ?? []).map((v) => v.value).filter(Boolean);
}

const sheet = (name: string, header: string[], ...rows: string[][]): Sheet => ({
  name,
  header,
  rows: rows.map((cells, i) => ({ n: i + 2, cells })),
});

describe('spreadsheet value rules (SPEC §4.4)', () => {
  it('splits Theme and Keyword on | when there is one, else on commas, and trims', () => {
    expect(splitList('CAKUT|synthetic|patient registry')).toEqual(['CAKUT', 'synthetic', 'patient registry']);
    expect(splitList('synthetic,catalog')).toEqual(['synthetic', 'catalog']);
    expect(splitList(' a | b, c |')).toEqual(['a', 'b, c']);
    expect(splitList('one')).toEqual(['one']);
    expect(splitList('')).toEqual([]);
  });

  it('turns ISO 639-1 codes into id.loc.gov IRIs and keeps full IRIs', () => {
    expect(languageIri('en')).toBe('http://id.loc.gov/vocabulary/iso639-1/en');
    expect(languageIri(' NL ')).toBe('http://id.loc.gov/vocabulary/iso639-1/nl');
    expect(languageIri('http://id.loc.gov/vocabulary/iso639-1/fr')).toBe('http://id.loc.gov/vocabulary/iso639-1/fr');
    expect(languageIri('English')).toBe('English');
  });

  it('gives an empty License the EJP RD licence, as a default', () => {
    expect(licenseIri('')).toEqual({ value: EJP_DEFAULT_LICENSE, defaulted: true });
    expect(licenseIri('https://creativecommons.org/licenses/by/4.0')).toEqual({ value: 'https://creativecommons.org/licenses/by/4.0', defaulted: false });
  });

  it("reads VPConnection: empty is VPDiscoverable, the template's purl terms are the w3id ones", () => {
    expect(vpConnectionIri('')).toEqual({ value: VP_DISCOVERABLE, defaulted: true });
    expect(vpConnectionIri('http://purl.org/ejp-rd/vocabulary/VPDiscoverable')).toEqual({ value: VP_DISCOVERABLE, defaulted: false });
    expect(vpConnectionIri('http://purl.org/ejp-rd/vocabulary/VPInvisible').value).toBe(VP_INVISIBLE);
    expect(vpConnectionIri('https://w3id.org/ejp-rd/vocabulary#VPInvisible').value).toBe(VP_INVISIBLE);
    expect(VP_DISCOVERABLE).toBe('https://w3id.org/ejp-rd/vocabulary#VPDiscoverable');
  });

  it('makes a date an xsd:dateTime at midnight without a time zone; leaves the rest', () => {
    expect(dateTimeOf('2026-11-06')).toBe('2026-11-06T00:00:00');
    expect(dateTimeOf('2026-11-06T13:05:00Z')).toBe('2026-11-06T13:05:00Z');
    expect(dateTimeOf('6 Nov 2026')).toBe('6 Nov 2026');
  });

  it('reads PersonalData as true or false only', () => {
    expect([personalDataOf('true'), personalDataOf('FALSE'), personalDataOf('yes'), personalDataOf('')]).toEqual([true, false, null, null]);
  });

  it('spells PopulationCoverage as the shape lists it, and keeps other values', () => {
    expect(populationCoverageOf('national')).toBe('National');
    expect(populationCoverageOf('Worldwide')).toBe('Worldwide');
  });

  it('makes a media type an IANA IRI', () => {
    expect(mediaTypeIri('text/csv')).toBe('http://www.iana.org/assignments/media-types/text/csv');
    expect(mediaTypeIri('https://www.iana.org/assignments/media-types/application/json')).toBe('https://www.iana.org/assignments/media-types/application/json');
    expect(mediaTypeIri('json')).toBe('json');
  });

  it('matches headers case- and space-insensitively, ODRL Policy and ODRLPolicy alike', () => {
    expect(columnOf('PatientRegistry', 'ODRL Policy')).toEqual(columnOf('Guideline', 'ODRLPolicy'));
    expect(columnOf('Catalog', ' landing page ')?.path).toBe(`${NS.dcat}landingPage`);
    expect(columnOf('Catalog', 'Notes')).toBeUndefined();
    // A distribution's Type is Access or Download, not a dct:type.
    expect(columnOf('Distribution', 'Type')?.rule).toBe('none');
    expect(columnOf('DataService', 'Type')?.path).toBe(`${NS.dct}type`);
  });

  it('skips the pre-filled row: only VPConnection set', () => {
    const s = sheet('Biobank', ['Title', 'VPConnection'], ['', 'http://purl.org/ejp-rd/vocabulary/VPDiscoverable'], ['A biobank', '']);
    expect(s.rows.map((r) => isPrefilled(s, r))).toEqual([true, false]);
  });
});

describe('spreadsheet column mapper (SPEC §4.4)', () => {
  const REG = sheet(
    'PatientRegistry',
    ['License', 'Title', 'Description', 'Theme', 'Publisher', 'ContactPoint', 'PersonalData', 'PopulationCoverage', 'Language', 'AccessRights', 'LandingPage', 'Distribution', 'VPConnection', 'ODRL Policy', 'Keyword', 'Issued', 'Modified', 'Version'],
    ['', 'A registry', 'About it', 'http://www.orpha.net/ORDO/Orphanet_93545', 'Org', 'mailto:a@example.org', 'true', 'national', 'en', '', 'https://example.org/r', 'D1|D2', '', '', 'a|b', '2026-11-06', '2026-11-07', '0.1'],
  );

  it('fills the patient registry form and collects the pointers', () => {
    const m = mapRow(REG, REG.rows[0], type('patientregistry'), forms.patientregistry);
    const v = (p: string, inner?: string) => valuesAt('patientregistry', m.values, p, inner);
    expect(m.title).toBe('A registry');
    expect(v(`${NS.dct}title`)).toEqual(['A registry']);
    expect(v(`${NS.dcat}theme`)).toEqual(['http://www.orpha.net/ORDO/Orphanet_93545']);
    expect(v(`${NS.dcat}keyword`)).toEqual(['a', 'b']);
    expect(v(`${NS.dct}language`)).toEqual(['http://id.loc.gov/vocabulary/iso639-1/en']);
    expect(v(`${NS.dct}license`)).toEqual([EJP_DEFAULT_LICENSE]);
    expect(v(`${NS.dct}issued`)).toEqual(['2026-11-06T00:00:00']);
    expect(v(`${NS.ejp}populationCoverage`, `${NS.rdfs}label`)).toEqual(['National']);
    // As the drop-down stores it.
    expect(v(`${NS.ejp}vpConnection`)).toEqual(['ejp:VPDiscoverable']);
    expect(m.defaults).toEqual([
      { column: 'License', value: EJP_DEFAULT_LICENSE },
      { column: 'VPConnection', value: VP_DISCOVERABLE },
    ]);
    expect(m.pointers.map((p) => [p.column, p.rule, p.values])).toEqual([
      ['Publisher', 'publisher', ['Org']],
      ['ContactPoint', 'contactPoint', ['mailto:a@example.org']],
      ['Distribution', 'children', ['D1', 'D2']],
    ]);
    // The ERDERA patient registry shape has no field for PersonalData.
    expect(m.notMapped).toEqual([{ column: 'PersonalData', why: 'noField' }]);
    expect(m.invalid).toEqual([]);
  });

  it('maps PersonalData on datasets to dpv:hasPersonalData dpv:HealthData, and reports values that are not true or false', () => {
    const ds = sheet('Dataset', ['Title', 'PersonalData', 'PopulationCoverage'], ['D', 'TRUE', 'European'], ['E', 'false', ''], ['F', 'maybe', '']);
    const [t, f, bad] = ds.rows.map((r) => mapRow(ds, r, type('dataset'), forms.dataset));
    expect(valuesAt('dataset', t.values, 'https://w3id.org/dpv#hasPersonalData')).toEqual([DPV_HEALTH_DATA]);
    expect(valuesAt('dataset', f.values, 'https://w3id.org/dpv#hasPersonalData')).toEqual([]);
    expect(bad.invalid).toEqual([{ column: 'PersonalData', value: 'maybe' }]);
    // No population coverage on ERDERA datasets.
    expect(t.notMapped).toEqual([{ column: 'PopulationCoverage', why: 'noField' }]);
    const cat = sheet('Catalog', ['Title', 'PersonalData'], ['C', 'yes']);
    expect(mapRow(cat, cat.rows[0], type('catalog'), forms.catalog)).toMatchObject({
      invalid: [{ column: 'PersonalData', value: 'yes' }],
      notMapped: [{ column: 'PersonalData', why: 'noField' }],
    });
  });

  it("keeps an invalid PopulationCoverage, so the shape's sh:in flags it", () => {
    const bad = sheet('Biobank', ['Title', 'PopulationCoverage'], ['B', 'Worldwide']);
    const m = mapRow(bad, bad.rows[0], type('biobank'), forms.biobank);
    expect(valuesAt('biobank', m.values, `${NS.ejp}populationCoverage`, `${NS.rdfs}label`)).toEqual(['Worldwide']);
  });

  it('reads the template VPConnection on a catalog; reports what the catalog form leaves to FDPlight', () => {
    const cat = sheet('Catalog', ['Title', 'VPConnection', 'Issued', 'ThemeTaxonomy', 'Homepage', 'Keyword'], ['C', 'http://purl.org/ejp-rd/vocabulary/VPInvisible', '2026-11-06', 'http://example.org/tax', 'https://example.org', 'x, y']);
    const m = mapRow(cat, cat.rows[0], type('catalog'), forms.catalog);
    expect(valuesAt('catalog', m.values, `${NS.ejp}vpConnection`)).toEqual(['ejp:VPInvisible']);
    expect(valuesAt('catalog', m.values, `${NS.foaf}homePage`)).toEqual(['https://example.org']);
    expect(valuesAt('catalog', m.values, `${NS.dcat}keyword`)).toEqual(['x', 'y']);
    expect(m.notMapped).toEqual([
      { column: 'Issued', why: 'generated' },
      { column: 'ThemeTaxonomy', why: 'noField' },
    ]);
  });

  it('maps distributions and data services', () => {
    const dist = sheet('Distribution', ['Title', 'MediaType', 'IsPartOf', 'Type', 'AccessService'], ['Download', 'text/csv', 'D1', 'Download', 'API']);
    const d = mapRow(dist, dist.rows[0], type('distribution'), forms.distribution);
    expect(valuesAt('distribution', d.values, `${NS.dct}format`)).toEqual(['http://www.iana.org/assignments/media-types/text/csv']);
    expect(d.pointers.map((p) => [p.column, p.rule, p.values])).toEqual([
      ['IsPartOf', 'parent', ['D1']],
      ['AccessService', 'children', ['API']],
    ]);
    expect(d.notMapped).toEqual([{ column: 'Type', why: 'never' }]);

    const svc = sheet('DataService', ['Title', 'Type', 'EndpointURL', 'ConformsTo', 'ServesDataset', 'ConformsTo'], ['API', 'http://edamontology.org/operation_0224', 'https://example.org/api', '', 'D1', 'https://www.ecma-international.org/publications-and-standards/standards/ecma-404/']);
    const s = mapRow(svc, svc.rows[0], type('dataservice2'), forms.dataservice2);
    expect(valuesAt('dataservice2', s.values, `${NS.dct}type`)).toEqual(['http://edamontology.org/operation_0224']);
    expect(valuesAt('dataservice2', s.values, `${NS.dcat}endpointURL`)).toEqual(['https://example.org/api']);
    // ConformsTo appears twice in the template's DataService sheet: both count.
    expect(valuesAt('dataservice2', s.values, `${NS.dct}conformsTo`)).toEqual(['https://www.ecma-international.org/publications-and-standards/standards/ecma-404/']);
    expect(s.pointers.map((p) => [p.column, p.rule, p.values])).toEqual([['ServesDataset', 'ref', ['D1']]]);
  });

  it('reads an Organisation row as publisher values; Location and Identifier have no field', () => {
    const org = sheet('Organisation', ['Title', 'Description', 'LandingPage', 'Logo', 'Location', 'Identifier'], ['Org', 'About', 'https://example.org', '', 'Enschede', 'https://ror.org/x']);
    expect(organisationValues(org, org.rows[0])).toEqual({
      name: 'Org',
      inner: { [`${NS.foaf}name`]: ['Org'], [`${NS.dct}description`]: ['About'], [`${NS.dcat}landingPage`]: ['https://example.org'] },
      notMapped: ['Location', 'Identifier'],
    });
  });
});
