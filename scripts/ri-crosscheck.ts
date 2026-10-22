// Cross-check FDPlight's output against the FDP reference implementation
// (TASKS Phase 3). Builds the same tree (root, catalog, dataset,
// distribution) from the same user metadata in a local RI, through its API,
// and in FDPlight, through planPublish. Then it compares the graphs per entity
// with IRIs, timestamps, versions and profile IRIs normalised.
//
// Needs a local RI on http://localhost:8190 with pinging disabled:
//
//   RI_CHECK_JWT_SECRET=$(openssl rand -hex 64) \
//     docker compose -f ~/GitHub/fdp-ri/compose.yaml -f scripts/ri-check/override.yaml up -d
//   npx vite-node scripts/ri-crosscheck.ts
//   docker compose -f ~/GitHub/fdp-ri/compose.yaml -f scripts/ri-check/override.yaml down -v
//
// Never point this at a public FDP.

import { expandTerm, importRecords, normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import { Parser, type Quad } from 'n3';
import { entityForm } from '../src/core/forms';
import { DEFAULT_ACCESS_RIGHTS } from '../src/core/profile';
import { iriOf, pathOf, type Entity, type Project } from '../src/core/project';
import { planPublish } from '../src/core/publish';
import { FDP_DEFAULT } from '../src/profiles/fdp-default';

const RI = process.env.RI_URL ?? 'http://localhost:8190';
const LOGIN = { email: 'albert.einstein@example.com', password: 'password' };

const PREFIXES = `@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;
const COMMON = `dct:publisher [ a foaf:Agent ; foaf:name "University of Twente" ] ;
  dcat:version "1.0" ;
  dct:language <http://id.loc.gov/vocabulary/iso639-1/en> ;
  dct:license <http://purl.org/NET/rdflicense/cc-by4.0>`;

/** User metadata per entity; {E} is the entity, {P} its parent (RI input only). */
const INPUT: Record<string, { prefix: string; ttl: string }> = {
  fdp: {
    prefix: '',
    ttl: `<{E}> dct:title "Cross-check FDP"@en ; dct:description "Root of the cross-check tree."@en ; ${COMMON} .`,
  },
  catalog: {
    prefix: 'catalog',
    ttl: `<{E}> a dcat:Catalog ; dct:title "Rare diseases"@en ; dct:description "A catalog."@en ; ${COMMON} ;
  dcat:themeTaxonomy <http://www.wikidata.org/entity/Q929833> .`,
  },
  dataset: {
    prefix: 'dataset',
    ttl: `<{E}> a dcat:Dataset ; dct:title "Registry 2024"@en ; dct:description "A dataset."@en ; ${COMMON} ;
  dcat:theme <http://www.wikidata.org/entity/Q929833> ; dcat:keyword "registry"@en ;
  dct:issued "2024-01-15T00:00:00Z"^^xsd:dateTime .`,
  },
  distribution: {
    prefix: 'distribution',
    ttl: `<{E}> a dcat:Distribution ; dct:title "Registry as CSV"@en ; ${COMMON} ;
  dcat:mediaType "text/csv" ; dcat:downloadURL <https://example.org/registry.csv> .`,
  },
};
const ORDER = ['fdp', 'catalog', 'dataset', 'distribution'];

const turtle = (type: string, e: string, parent?: string) =>
  PREFIXES + INPUT[type].ttl.replaceAll('{E}', e) + (parent ? `\n<${e}> dct:isPartOf <${parent}> .\n` : '\n');

// ---------------------------------------------------------------- RI side ----

async function ri(method: string, path: string, token: string, body?: string, type = 'text/turtle') {
  const res = await fetch(RI + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: type === 'application/json' ? type : 'text/turtle', ...(body ? { 'Content-Type': type } : {}) },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}\n${text.slice(0, 800)}`);
  return { text, location: res.headers.get('location') };
}

async function buildInRi(): Promise<Map<string, { iri: string; ttl: string }>> {
  const login = await fetch(`${RI}/tokens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(LOGIN) });
  if (!login.ok) throw new Error(`login failed: HTTP ${login.status}`);
  const { token } = (await login.json()) as { token: string };

  const root = (await ri('GET', '/', token)).text;
  const rootIri = new Parser().parse(root).find((q) => q.predicate.value.endsWith('#metadataIdentifier'))!.subject.value;
  await ri('PUT', '/', token, turtle('fdp', rootIri));
  const iris = new Map([['fdp', rootIri]]);
  for (const type of ORDER.slice(1)) {
    const parent = iris.get(ORDER[ORDER.indexOf(type) - 1])!;
    const created = await ri('POST', `/${INPUT[type].prefix}`, token, turtle(type, `${RI}/${INPUT[type].prefix}/new`, parent));
    const iri = created.location ?? '';
    iris.set(type, iri);
    await ri('PUT', `${new URL(iri).pathname}/meta/state`, token, JSON.stringify({ current: 'PUBLISHED' }), 'application/json');
  }
  const out = new Map<string, { iri: string; ttl: string }>();
  for (const type of ORDER) {
    const iri = iris.get(type)!;
    const path = type === 'fdp' ? '/' : new URL(iri).pathname;
    out.set(type, { iri, ttl: (await ri('GET', path, token)).text });
  }
  return out;
}

// ----------------------------------------------------------- FDPlight side ---

async function buildInFdplight(): Promise<Map<string, { iri: string; ttl: string }>> {
  const ids: Record<string, string> = { fdp: '', catalog: 'rare-diseases', dataset: 'registry', distribution: 'registry-csv' };
  const project: Project = {
    fdplight: '0.1',
    name: 'Cross-check',
    base: 'https://example.org/fdp/',
    iriMode: 'file',
    storageBase: null,
    defaults: {
      language: 'http://id.loc.gov/vocabulary/iso639-1/en',
      license: null,
      accessRightsDescription: DEFAULT_ACCESS_RIGHTS,
      // The RI's defaults (Settings.DEFAULT_METRICS).
      metrics: [
        { metric: 'https://purl.org/fair-metrics/FM_F1A', resource: 'https://www.ietf.org/rfc/rfc3986.txt' },
        { metric: 'https://purl.org/fair-metrics/FM_A1.1', resource: 'https://www.wikidata.org/wiki/Q8777' },
      ],
    },
    types: FDP_DEFAULT.types,
    entities: [],
  };
  let parent: string | null = null;
  for (const type of ORDER) {
    const e: Entity = { type, id: ids[type], parent };
    project.entities.push(e);
    parent = pathOf(project, e);
  }
  const forms = Object.fromEntries(FDP_DEFAULT.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  for (const e of project.entities) {
    const iri = iriOf(project, e);
    // As the loader does: type the subject with the form's primary class.
    const primary = expandTerm(forms[e.type].targetClass, forms[e.type].prefixes);
    const imp = importRecords(`${turtle(e.type, iri)}\n<${iri}> a <${primary}> .\n`, 'turtle', forms[e.type]);
    const rec = imp.records.find((r) => r.subject === iri);
    if (!rec) throw new Error(`FDPlight could not read the ${e.type} input`);
    // Triples without a form field are kept, as when the app loads a file.
    extras[pathOf(project, e)] = imp.unmappedQuads as unknown as Quad[];
    values[pathOf(project, e)] = rec.values ?? normalizeRecord(forms[e.type], {});
  }
  const plan = await planPublish({ project, forms, values, extras: extras as never, shapes: FDP_DEFAULT.shapes, remote: new Map(), remoteFiles: [], now: new Date() });
  const out = new Map<string, { iri: string; ttl: string }>();
  for (const e of project.entities) {
    const file = plan.changes.find((c) => c.path === pathOf(project, e))!;
    out.set(e.type, { iri: iriOf(project, e), ttl: file.content! });
  }
  return out;
}

// -------------------------------------------------------------- normalise ----

const TIME_PREDICATES = new Set([
  'https://w3id.org/fdp/fdp-o#metadataIssued',
  'https://w3id.org/fdp/fdp-o#metadataModified',
  'http://purl.org/dc/terms/issued',
  'http://purl.org/dc/terms/modified',
]);
const LDP = 'http://www.w3.org/ns/ldp#';

/** Triples of one entity's graph as comparable strings, IRIs replaced by tokens. */
function normalise(ttl: string, iris: Map<string, { iri: string }>): Set<string> {
  const quads: Quad[] = new Parser().parse(ttl);
  const tokens = [...iris].map(([type, { iri }]) => [iri, type.toUpperCase()] as const).sort((a, b) => b[0].length - a[0].length);
  // Containers are named by what they hold, not by their IRI (RI: E/catalog/, FDPlight: E#catalog).
  const containers = new Map<string, string>();
  for (const q of quads)
    if (q.predicate.value === LDP + 'hasMemberRelation') {
      const member = quads.find((x) => x.subject.equals(q.subject) && x.predicate.value === LDP + 'membershipResource')?.object.value ?? '?';
      containers.set(q.subject.value, `CONTAINER(${member}, ${q.object.value})`);
    }
  const profiles = new Set(quads.filter((q) => q.predicate.value === 'http://purl.org/dc/terms/conformsTo').map((q) => q.object.value));
  const iri = (v: string): string => {
    if (containers.has(v)) return iri(containers.get(v)!);
    if (profiles.has(v)) return 'PROFILE';
    for (const [x, t] of tokens) if (v === x) return t;
    for (const [x, t] of tokens) if (v.startsWith(x)) return t + v.slice(x.length).replace(/^\//, '#');
    return v.replace(/CONTAINER\((.*), (.*)\)/, (_m, a, b) => `CONTAINER(${iri(a)}, ${b})`);
  };
  const term = (t: Quad['object'], p?: string): string => {
    if (t.termType === 'NamedNode') return `<${iri(t.value)}>`;
    if (t.termType === 'BlankNode') return '_:b';
    if (p && TIME_PREDICATES.has(p)) return '"TIME"';
    if (p === 'https://w3id.org/fdp/fdp-o#fdpSoftwareVersion') return '"VERSION"';
    const lit = t as unknown as { value: string; language: string; datatype: { value: string } };
    const value = tokens.some(([x]) => x === lit.value) ? iri(lit.value) : lit.value;
    return `"${value}"${lit.language ? '@' + lit.language : lit.datatype.value.endsWith('#string') ? '' : '^^' + lit.datatype.value.replace('http://www.w3.org/2001/XMLSchema#', 'xsd:')}`;
  };
  return new Set(quads.map((q) => `${term(q.subject as never)} <${q.predicate.value}> ${term(q.object, q.predicate.value)}`));
}

async function main(): Promise<void> {
  const ri = await buildInRi();
  const fl = await buildInFdplight();
  let same = 0;
  for (const type of ORDER) {
    const a = normalise(ri.get(type)!.ttl, ri);
    const b = normalise(fl.get(type)!.ttl, fl);
    const onlyRi = [...a].filter((x) => !b.has(x)).sort();
    const onlyFl = [...b].filter((x) => !a.has(x)).sort();
    same += [...a].filter((x) => b.has(x)).length;
    console.log(`\n## ${type} (RI ${ri.get(type)!.iri})`);
    console.log(`identical: ${[...a].filter((x) => b.has(x)).length}`);
    for (const x of onlyRi) console.log(`  only RI       ${x}`);
    for (const x of onlyFl) console.log(`  only FDPlight ${x}`);
  }
  console.log(`\n${same} triples identical in total`);
  if (process.argv.includes('--show')) for (const type of ORDER) console.log(`\n# RI ${type}\n${ri.get(type)!.ttl}\n# FDPlight ${type}\n${fl.get(type)!.ttl}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
