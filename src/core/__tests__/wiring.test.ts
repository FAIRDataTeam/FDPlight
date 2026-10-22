import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataFactory, Parser, Store } from 'n3';
import { md5Hex } from '../md5';
import { iriOf, stamp, type Entity, type Project } from '../project';
import { FDPLIGHT_VERSION } from '../version';
import { DCAT, DCT, FDP, LDP, RDFS_LABEL, RDF_TYPE, SIO } from '../vocab';
import { pickTitle, serializeEntity } from '../wiring';
import { defaultProject, FILE_MODE, REDIRECT_MODE } from './fixtures/defaultTree';

const { literal } = DataFactory;
const B = FILE_MODE.base;
const ROOT = `${B}fdp.ttl`;
const CAT = `${B}catalog/rare-diseases.ttl`;
const DS = `${B}dataset/registry-2024.ttl`;

const PREFIXES = `@prefix dct: <http://purl.org/dc/terms/> . @prefix dcat: <http://www.w3.org/ns/dcat#> .
  @prefix ldp: <http://www.w3.org/ns/ldp#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
  @prefix ex: <https://example.org/> .`;
const ttl = (s: string) => new Store(new Parser().parse(PREFIXES + s));

function entity(p: Project, path: string): Entity {
  return p.entities.find((e) => (e.type === 'fdp' ? 'fdp.ttl' : `${e.type}/${e.id}.ttl`) === path)!;
}
function out(p: Project, path: string, user = new Store()): Store {
  return serializeEntity(p, entity(p, path), user);
}
const objects = (g: Store, s: string, pred: string) => g.getQuads(s, pred, null, null).map((q) => q.object.value).sort();
const has = (g: Store, s: string, pred: string) => g.getQuads(s, pred, null, null).length > 0;

describe('serializeEntity — system triples (SPEC §5.2)', () => {
  const p = defaultProject(FILE_MODE);

  it('replaces rdf:type with the target classes', () => {
    const g = out(p, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> a ldp:BasicContainer, ex:Thing ; dct:title "T" .`));
    expect(objects(g, CAT, RDF_TYPE)).toEqual(['http://www.w3.org/ns/dcat#Catalog', 'http://www.w3.org/ns/dcat#Resource']);
    expect(objects(g, CAT, DCT.title)).toEqual(['T']); // metadata on E survives an ldp type on E
  });

  it('adds the metadata identifier as a plain literal', () => {
    const g = out(p, 'catalog/rare-diseases.ttl');
    expect(objects(g, CAT, FDP.metadataIdentifier)).toEqual([`${CAT}#identifier`]);
    expect(objects(g, `${CAT}#identifier`, RDF_TYPE)).toEqual(['http://purl.org/spar/datacite/Identifier']);
    const id = g.getQuads(`${CAT}#identifier`, DCT.identifier, null, null)[0].object;
    expect(id.equals(literal(CAT))).toBe(true);
  });

  it('labels with the English title as a plain literal, or none without a title', () => {
    expect(pickTitle([literal('b', 'nl'), literal('a', 'de'), literal('Title', 'en-GB')])).toBe('Title');
    expect(pickTitle([literal('b', 'nl'), literal('a', 'de')])).toBe('a');
    expect(pickTitle([])).toBeNull();
    const g = out(p, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> dct:title "Rare"@en ; <${RDFS_LABEL}> "stale" .`));
    expect(g.getQuads(CAT, RDFS_LABEL, null, null).map((q) => q.object)).toEqual([literal('Rare')]);
    expect(has(out(p, 'catalog/rare-diseases.ttl'), CAT, RDFS_LABEL)).toBe(false);
  });

  it('adds the default language and licence only when the user gave none', () => {
    const q = { ...p, defaults: { ...p.defaults, license: 'https://creativecommons.org/licenses/by/4.0/' } };
    const g = out(q, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> dct:license ex:mine .`));
    expect(objects(g, CAT, DCT.language)).toEqual(['http://id.loc.gov/vocabulary/iso639-1/en']);
    expect(objects(g, CAT, DCT.license)).toEqual(['https://example.org/mine']);
    expect(objects(out(q, 'catalog/rare-diseases.ttl'), CAT, DCT.license)).toEqual(['https://creativecommons.org/licenses/by/4.0/']);
    expect(has(out(p, 'catalog/rare-diseases.ttl'), CAT, DCT.license)).toBe(false);
  });

  it('adds a default access-rights statement only when the user gave none', () => {
    const q = { ...p, defaults: { ...p.defaults, accessRightsDescription: 'Ask us.' } };
    const g = out(q, 'catalog/rare-diseases.ttl');
    expect(objects(g, CAT, DCT.accessRights)).toEqual([`${CAT}#accessRights`]);
    expect(objects(g, `${CAT}#accessRights`, DCT.description)).toEqual(['Ask us.']);
    const own = out(q, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> dct:accessRights <${CAT}#accessRights> . <${CAT}#accessRights> dct:description "Mine" .`));
    expect(objects(own, `${CAT}#accessRights`, DCT.description)).toEqual(['Mine']);
  });

  it('writes fdp:metadataIssued/Modified on every entity and drops stale values', () => {
    const g = out(p, 'dataset/registry-2024.ttl', ttl(`<${DS}> <${FDP.metadataIssued}> "1999-01-01T00:00:00Z"^^xsd:dateTime .`));
    expect(objects(g, DS, FDP.metadataIssued)).toEqual(['2026-10-01T10:00:00.000Z']);
    expect(objects(g, DS, FDP.metadataModified)).toEqual(['2026-10-22T12:00:00.000Z']);
  });

  it('links to the parent with dct:isPartOf, replacing a stale one', () => {
    const g = out(p, 'dataset/registry-2024.ttl', ttl(`<${DS}> dct:isPartOf ex:old .`));
    expect(objects(g, DS, DCT.isPartOf)).toEqual([CAT]);
    expect(has(out(p, 'fdp.ttl'), ROOT, DCT.isPartOf)).toBe(false);
  });

  it('declares conformance to the type profile and keeps user dct:conformsTo', () => {
    const g = out(p, 'dataset/registry-2024.ttl', ttl(`<${DS}> dct:conformsTo ex:standard .`));
    expect(objects(g, DS, DCT.conformsTo)).toEqual([`${B}profile/dataset.ttl`, 'https://example.org/standard']);
    expect(objects(g, `${B}profile/dataset.ttl`, RDFS_LABEL)).toEqual(['Dataset Profile']);
  });

  it('emits metric nodes named like the RI, only when metrics are configured', () => {
    expect(has(out(p, 'fdp.ttl'), ROOT, SIO.refersTo)).toBe(false);
    const q = {
      ...p,
      defaults: { ...p.defaults, metrics: [{ metric: 'https://purl.org/fair-metrics/FM_F1A', resource: 'https://www.ietf.org/rfc/rfc3986.txt' }] },
    };
    const g = out(q, 'fdp.ttl');
    const node = `${ROOT}/metrics/${md5Hex('https://purl.org/fair-metrics/FM_F1A')}`;
    expect(objects(g, ROOT, SIO.refersTo)).toEqual([node]);
    expect(objects(g, node, SIO.refersTo)).toEqual(['https://www.ietf.org/rfc/rfc3986.txt']);
    expect(objects(g, node, SIO.isAbout)).toEqual(['https://www.ietf.org/rfc/rfc3986.txt']);
  });

  it('refuses an unstamped entity or a missing parent', () => {
    const unstamped = { ...entity(p, 'fdp.ttl'), issued: undefined };
    expect(() => serializeEntity(p, unstamped, new Store())).toThrow(/stamp it/);
    const orphan = { ...entity(p, 'dataset/empty-set.ttl'), parent: 'catalog/gone.ttl' };
    expect(() => serializeEntity(p, orphan, new Store())).toThrow(/not in the project/);
  });
});

describe('serializeEntity — catalog timestamps (SPEC §5.3)', () => {
  const p = defaultProject(FILE_MODE);
  it('catalogs get dct:issued/modified equal to the metadata timestamps', () => {
    const g = out(p, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> dct:issued "2020-01-01T00:00:00Z"^^xsd:dateTime .`));
    expect(objects(g, CAT, DCT.issued)).toEqual(['2026-10-01T10:00:00.000Z']);
    expect(objects(g, CAT, DCT.modified)).toEqual(['2026-10-22T12:00:00.000Z']);
  });
  it('other types keep the user dct:issued/modified and get none by default', () => {
    const g = out(p, 'dataset/registry-2024.ttl', ttl(`<${DS}> dct:issued "2024-02-04T00:00:00Z"^^xsd:dateTime .`));
    expect(objects(g, DS, DCT.issued)).toEqual(['2024-02-04T00:00:00Z']);
    expect(has(g, DS, DCT.modified)).toBe(false);
  });
});

describe('serializeEntity — root (SPEC §5.4)', () => {
  it('adds the software version and the endpoint URL', () => {
    const p = defaultProject(REDIRECT_MODE);
    const root = REDIRECT_MODE.base;
    const g = serializeEntity(p, entity(p, 'fdp.ttl'), new Store(), { version: '9.9.9' });
    expect(objects(g, root, FDP.fdpSoftwareVersion)).toEqual(['FDPlight:9.9.9']);
    expect(objects(g, root, DCAT.endpointURL)).toEqual([root]);
    expect(objects(serializeEntity(p, entity(p, 'fdp.ttl'), new Store()), root, FDP.fdpSoftwareVersion)).toEqual([
      `FDPlight:${FDPLIGHT_VERSION}`,
    ]);
  });
  it('the version constant matches package.json', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'));
    expect(FDPLIGHT_VERSION).toBe(pkg.version);
  });
});

describe('serializeEntity — child links and containers (SPEC §5.5)', () => {
  it('follows the tree when a child moves to another parent', () => {
    const p = defaultProject(FILE_MODE);
    const other: Entity = { type: 'catalog', id: 'other', parent: 'fdp.ttl', issued: 'x', modified: 'x' };
    p.entities.push(other);
    entity(p, 'dataset/empty-set.ttl').parent = 'catalog/other.ttl';
    const cat = out(p, 'catalog/rare-diseases.ttl', ttl(`<${CAT}> dcat:dataset <${B}dataset/empty-set.ttl> .`));
    const oth = out(p, 'catalog/other.ttl');
    expect(objects(cat, CAT, 'http://www.w3.org/ns/dcat#dataset')).toEqual([DS]);
    expect(objects(cat, `${CAT}#dataset`, LDP.contains)).toEqual([DS]);
    expect(objects(oth, `${B}catalog/other.ttl#dataset`, LDP.contains)).toEqual([`${B}dataset/empty-set.ttl`]);
    expect(objects(out(p, 'fdp.ttl'), `${ROOT}#catalog`, LDP.contains)).toEqual([`${B}catalog/other.ttl`, CAT]);
  });

  it('emits an empty container for a child type with no children', () => {
    const p = defaultProject(FILE_MODE);
    const g = out(p, 'dataset/empty-set.ttl');
    const c = `${B}dataset/empty-set.ttl#distribution`;
    expect(objects(g, c, RDF_TYPE)).toEqual([LDP.DirectContainer]);
    expect(has(g, c, LDP.contains)).toBe(false);
  });

  it('drops hand-written containers at any IRI', () => {
    const p = defaultProject(REDIRECT_MODE);
    const cat = `${REDIRECT_MODE.base}catalog/rare-diseases`;
    const g = serializeEntity(p, entity(p, 'catalog/rare-diseases.ttl'), ttl(`<${cat}#dataset> a ldp:DirectContainer ; ldp:contains ex:x . ex:shared a ldp:DirectContainer .`));
    expect(has(g, `${cat}#dataset`, LDP.contains)).toBe(false);
    expect(has(g, 'https://example.org/shared', RDF_TYPE)).toBe(false);
    expect(has(g, `${cat}/dataset/`, LDP.contains)).toBe(true);
  });
});

describe('serializeEntity — nested and unknown triples (SPEC §5.6, §5.7)', () => {
  it('keeps hash-IRI nodes, blank nodes and unknown triples verbatim', () => {
    const p = defaultProject(FILE_MODE);
    const user = ttl(`<${DS}> dct:publisher <${DS}#publisher> ; ex:unknown "kept" ; dcat:contactPoint [ ex:email "a@b.c" ] .
      <${DS}#publisher> ex:name "P" . ex:elsewhere ex:p ex:o .`);
    const g = out(p, 'dataset/registry-2024.ttl', user);
    for (const q of user) expect(g.has(q)).toBe(true);
  });
});

describe('stamp (SPEC §5.2)', () => {
  it('sets issued once and modified on every save', () => {
    const e: Entity = { type: 'catalog', id: 'x', parent: 'fdp.ttl' };
    const first = stamp(e, new Date('2026-01-01T00:00:00Z'));
    const second = stamp(first, new Date('2026-02-01T00:00:00Z'));
    expect(second).toMatchObject({ issued: '2026-01-01T00:00:00.000Z', modified: '2026-02-01T00:00:00.000Z' });
  });
});

it('iriOf follows the mode', () => {
  expect(iriOf(defaultProject(FILE_MODE), { type: 'dataset', id: 'a', parent: null })).toBe(`${B}dataset/a.ttl`);
});
