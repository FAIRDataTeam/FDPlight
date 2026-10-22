// The default-profile example tree used by the golden tests (HANDOFF §4.4):
// root → 1 catalog → 2 datasets (one with a distribution, one without, so an
// empty container appears) → 1 distribution. The user graphs carry some
// stale wiring that serializeEntity must drop.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import type { IriSettings } from '../../iri';
import { typesFromResourceDefinitions } from '../../profile';
import { iriOf, type Entity, type Project } from '../../project';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const recordedResourceDefinitions = JSON.parse(
  readFileSync(here('./home.fairdatapoint.org/resource-definitions.json'), 'utf8'),
);

export const FILE_MODE: IriSettings = { base: 'https://example.github.io/my-fdp/', iriMode: 'file', storageBase: null };
export const REDIRECT_MODE: IriSettings = {
  base: 'https://w3id.org/example/my-fdp/',
  iriMode: 'redirect',
  storageBase: 'https://example.github.io/my-fdp/',
};

const ISSUED = '2026-10-01T10:00:00.000Z';
const MODIFIED = '2026-10-22T12:00:00.000Z';
const t = { issued: ISSUED, modified: MODIFIED };

export const ENTITIES: Entity[] = [
  { type: 'fdp', id: '', parent: null, ...t },
  { type: 'catalog', id: 'rare-diseases', parent: 'fdp.ttl', ...t },
  { type: 'dataset', id: 'registry-2024', parent: 'catalog/rare-diseases.ttl', ...t },
  { type: 'dataset', id: 'empty-set', parent: 'catalog/rare-diseases.ttl', ...t },
  { type: 'distribution', id: 'registry-csv', parent: 'dataset/registry-2024.ttl', ...t },
];

export function defaultProject(s: IriSettings): Project {
  return {
    fdplight: '0.1',
    name: 'Example FDP',
    ...s,
    defaults: {
      language: 'http://id.loc.gov/vocabulary/iso639-1/en',
      license: null,
      accessRightsDescription: 'This resource has no access restriction',
      metrics: [],
    },
    types: typesFromResourceDefinitions(recordedResourceDefinitions),
    entities: ENTITIES.map((e) => ({ ...e })),
  };
}

/** User metadata per entity path, as Turtle with `<E>` standing for the entity IRI. */
const USER: Record<string, string> = {
  'fdp.ttl': `
    <E> dct:title "Example FDP"@en ;
        dct:description "A file-only FAIR Data Point."@en ;
        dct:publisher <E#publisher> .
    <E#publisher> a foaf:Agent ; foaf:name "Example Organisation" .`,
  // Stale wiring: an old parent, an old timestamp, a hand-written container.
  'catalog/rare-diseases.ttl': `
    <E> dct:title "Zeldzame ziekten"@nl, "Rare diseases"@en ;
        dct:issued "2020-01-01T00:00:00Z"^^xsd:dateTime ;
        dct:isPartOf <https://old.example.org/fdp> ;
        dcat:dataset <https://old.example.org/dataset/x> ;
        dct:publisher <E#publisher> .
    <E#publisher> a foaf:Agent ; foaf:name "Example Organisation" .
    <E#dataset> a ldp:DirectContainer ; ldp:contains <https://old.example.org/dataset/x> .`,
  // User dates describe the data and stay; user access rights suppress the default.
  'dataset/registry-2024.ttl': `
    <E> dct:title "Registry 2024"@en ;
        dct:issued "2024-02-04T00:00:00Z"^^xsd:dateTime ;
        dcat:keyword "registry"@en ;
        dct:accessRights <https://example.org/rights/restricted> .`,
  'dataset/empty-set.ttl': `
    <E> dct:title "Empty set"@en ;
        dct:language <http://id.loc.gov/vocabulary/iso639-1/nl> .`,
  'distribution/registry-csv.ttl': `
    <E> dct:title "Registry 2024 (CSV)"@en ;
        dcat:downloadURL <https://example.org/registry-2024.csv> ;
        dcat:mediaType <https://www.iana.org/assignments/media-types/text/csv> .`,
};

const PREFIXES = `
  @prefix dct: <http://purl.org/dc/terms/> .
  @prefix dcat: <http://www.w3.org/ns/dcat#> .
  @prefix foaf: <http://xmlns.com/foaf/0.1/> .
  @prefix ldp: <http://www.w3.org/ns/ldp#> .
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

export function userGraph(project: Project, path: string): Store {
  const e = project.entities.find((x) => x.type && pathOfEntity(x) === path)!;
  const iri = iriOf(project, e);
  const ttl = PREFIXES + USER[path].replaceAll('<E>', `<${iri}>`).replaceAll('<E#', `<${iri}#`);
  return new Store(new Parser().parse(ttl));
}

function pathOfEntity(e: Entity): string {
  return e.type === 'fdp' ? 'fdp.ttl' : `${e.type}/${e.id}.ttl`;
}
