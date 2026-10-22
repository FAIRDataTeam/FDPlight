import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  importProfileFromFdp,
  parseProjectFile,
  stringifyProjectFile,
  typesFromResourceDefinitions,
  validateTypes,
  type FetchLike,
  type ProjectFile,
} from '../profile';
import { recordedResourceDefinitions } from './fixtures/defaultTree';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/home.fairdatapoint.org/${name}`, import.meta.url)), 'utf8');

// The example from SPEC §3.1, with the new storageBase field.
const SPEC_EXAMPLE = {
  fdplight: '0.1',
  name: 'ERDERA Level 1',
  base: 'https://erdera.github.io/my-fdp/',
  iriMode: 'file',
  storageBase: null,
  defaults: {
    language: 'http://id.loc.gov/vocabulary/iso639-1/en',
    license: null,
    accessRightsDescription: 'This resource has no access restriction',
    metrics: [],
  },
  types: [
    {
      key: 'fdp',
      name: 'FAIR Data Point',
      urlPrefix: '',
      targetClasses: [
        'https://w3id.org/fdp/fdp-o#MetadataService',
        'http://www.w3.org/ns/dcat#DataService',
        'http://www.w3.org/ns/dcat#Resource',
        'https://w3id.org/fdp/fdp-o#FAIRDataPoint',
      ],
      shapes: 'shapes/fdp.ttl',
      children: [{ type: 'catalog', relation: 'https://w3id.org/fdp/fdp-o#metadataCatalog', title: 'Catalogs' }],
    },
    {
      key: 'catalog',
      name: 'Catalog',
      urlPrefix: 'catalog',
      targetClasses: ['http://www.w3.org/ns/dcat#Resource', 'http://www.w3.org/ns/dcat#Catalog'],
      shapes: 'shapes/catalog.ttl',
      children: [],
    },
  ],
};

describe('parseProjectFile (SPEC §3.1)', () => {
  it('accepts the SPEC example and round-trips it', () => {
    const r = parseProjectFile(JSON.stringify(SPEC_EXAMPLE));
    expect(r.ok).toBe(true);
    const value = (r as { value: ProjectFile }).value;
    expect(parseProjectFile(stringifyProjectFile(value))).toEqual(r);
    expect(stringifyProjectFile(value).endsWith('}\n')).toBe(true);
  });

  it('defaults iriMode to file and fills missing defaults', () => {
    const { iriMode: _m, storageBase: _s, defaults: _d, ...rest } = SPEC_EXAMPLE;
    const r = parseProjectFile(rest);
    expect(r.ok && r.value.iriMode).toBe('file');
    expect(r.ok && r.value.defaults.accessRightsDescription).toBe('This resource has no access restriction');
  });

  it('reports every problem', () => {
    const r = parseProjectFile({ ...SPEC_EXAMPLE, fdplight: '2.0', base: 'http://x/', iriMode: 'redirect' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toEqual([
      'unsupported format version 2.0',
      'base URI must use https',
      'redirect mode needs a storage base',
    ]);
  });

  it('rejects bad JSON and non-objects', () => {
    expect(parseProjectFile('{').ok).toBe(false);
    expect(parseProjectFile('[]').ok).toBe(false);
  });
});

describe('validateTypes (SPEC §3.1)', () => {
  const types = SPEC_EXAMPLE.types;
  it('needs exactly one root', () => {
    expect(validateTypes(types.map((t) => ({ ...t, urlPrefix: t.key })))).toContain(
      'exactly one type must have urlPrefix "" (found 0)',
    );
  });
  it('checks keys, prefixes and child references', () => {
    const bad = [types[0], { ...types[1], key: 'fdp' }, { ...types[1], key: 'x', urlPrefix: 'Catalog', children: [{ type: 'nope', relation: 'r', title: 'T' }] }];
    expect(validateTypes(bad)).toEqual([
      'types[1].key "fdp" is duplicated',
      'types[2].urlPrefix must be "" or a lowercase path segment',
      'types[0].children[0].type "catalog" is not a known type',
      'types[2].children[0].type "nope" is not a known type',
      'types[2].children[0].relation must be an IRI',
    ]);
  });
  it('reserves the profile prefix', () => {
    expect(validateTypes([types[0], { ...types[1], urlPrefix: 'profile' }])).toContain(
      'types[1].urlPrefix "profile" is reserved for profile IRIs',
    );
  });
});

describe('typesFromResourceDefinitions (SPEC §3)', () => {
  it('maps the recorded home.fairdatapoint.org definitions, root first', () => {
    const types = typesFromResourceDefinitions(recordedResourceDefinitions);
    expect(types.map((t) => [t.key, t.urlPrefix, t.children.map((c) => `${c.type} ${c.title}`)])).toEqual([
      ['fdp', '', ['catalog Catalogs']],
      ['catalog', 'catalog', ['dataset Datasets']],
      ['dataset', 'dataset', ['distribution Distributions']],
      ['distribution', 'distribution', []],
    ]);
    expect(types[0].targetClasses).toEqual(SPEC_EXAMPLE.types[0].targetClasses);
    expect(types[1].shapes).toBe('shapes/catalog.ttl');
    expect(validateTypes(types)).toEqual([]);
  });
});

describe('importProfileFromFdp (SPEC §3)', () => {
  const responses: Record<string, string> = {
    'https://fdp.test/resource-definitions': fixture('resource-definitions.json'),
    'https://fdp.test/spec': fixture('spec-fdp.ttl'),
    'https://fdp.test/catalog/spec': fixture('spec-catalog.ttl'),
    'https://fdp.test/dataset/spec': fixture('spec-dataset.ttl'),
    'https://fdp.test/distribution/spec': fixture('spec-distribution.ttl'),
  };
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push(`${init?.headers?.Accept} ${url}`);
    const body = responses[url];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  };

  it('reads the definitions and every /spec, recording the source', async () => {
    const p = await importProfileFromFdp('https://fdp.test/', fetchFn, () => new Date('2026-10-22T00:00:00Z'));
    expect(calls).toEqual([
      'application/json https://fdp.test/resource-definitions',
      'text/turtle https://fdp.test/spec',
      'text/turtle https://fdp.test/catalog/spec',
      'text/turtle https://fdp.test/dataset/spec',
      'text/turtle https://fdp.test/distribution/spec',
    ]);
    expect(Object.keys(p.shapes)).toEqual(['fdp', 'catalog', 'dataset', 'distribution']);
    expect(p.shapes.catalog).toContain('CatalogShape');
    expect(p.source).toEqual({ fdp: 'https://fdp.test', importedAt: '2026-10-22T00:00:00.000Z' });
  });

  it('fails clearly on an HTTP error', async () => {
    await expect(importProfileFromFdp('https://nope.test', fetchFn)).rejects.toThrow(
      'GET https://nope.test/resource-definitions failed with HTTP 404',
    );
  });
});
