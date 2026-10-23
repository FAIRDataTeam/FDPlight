// The Virtual Platform's Level 1 and Level 2 queries (ERDERA WP13.3, SPEC
// §9.6) over what FDPlight writes for an ERDERA project with every type.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import oxigraph from 'oxigraph';
import { entityForm, userGraphFromForm } from '../../core/forms';
import { iriOf, pathOf, stamp, type Project } from '../../core/project';
import { addChild } from '../../core/tree';
import { DCT, NS } from '../../core/vocab';
import { serializeEntity, toTurtle } from '../../core/wiring';
import { newProject } from '../../composables/useProject';
import { ERDERA } from '../erdera';

// Two changes make the queries run on Oxigraph, which follows the SPARQL
// spec strictly (SPEC §9.6). Both SELECT lists name ?resource twice, an
// error there; the repeat is dropped. And Level 1 binds ?connection,
// ?discoverable and ?invisible with VALUES outside its UNION, so under the
// spec's bottom-up evaluation they are unbound inside it and its FILTER NOT
// EXISTS removes every row. An engine that evaluates the VALUES first and
// passes its bindings into the UNION behaves as if the constants were
// written in, which is what the test does.
const VALUES: Record<string, string> = { connection: 'ejprd:vpConnection', discoverable: 'ejprd:VPDiscoverable', invisible: 'ejprd:VPInvisible' };
const runnable = (q: string) =>
  q
    .replace(/^SELECT DISTINCT (.*)$/m, (_, vars: string) => `SELECT DISTINCT ${[...new Set(vars.trim().split(/\s+/))].join(' ')}`)
    .replace(/^\s*VALUES \?(\w+) \{[^}]*\}\s*$/gm, '')
    .replace(/\?(connection|discoverable|invisible)\b/g, (_, v: string) => VALUES[v]);
const query = (name: string) =>
  runnable(readFileSync(fileURLToPath(new URL(`../erdera/vp-queries/${name}.sparql`, import.meta.url)), 'utf8'));
const LEVEL1 = query('vp_level1_query');
const LEVEL2 = query('vp_level2_query');
const EJP = 'https://w3id.org/ejp-rd/vocabulary#';
const EDAM_SERVICE = 'http://edamontology.org/operation_0224';
const BASE = 'https://erdera.github.io/my-fdp/';
const forms = Object.fromEntries(ERDERA.types.map((t) => [t.key, entityForm(t, ERDERA.shapes[t.key])]));

/** Every ERDERA type in use, one record each. */
function allTypes(): Project {
  const p = newProject(BASE, ERDERA);
  p.use = ERDERA.types.filter((t) => t.urlPrefix !== '').map((t) => t.key);
  for (const [parent, type, id] of [
    ['fdp.ttl', 'catalog', 'rare'],
    ['catalog/rare.ttl', 'dataset', 'ds'],
    ['dataset/ds.ttl', 'distribution', 'dist'],
    ['distribution/dist.ttl', 'dataservice', 'access'],
    ['catalog/rare.ttl', 'patientregistry', 'reg'],
    ['catalog/rare.ttl', 'biobank', 'bb'],
    ['catalog/rare.ttl', 'guideline', 'gl'],
    ['catalog/rare.ttl', 'dataservice2', 'api'],
  ]) {
    const r = addChild(p, parent, type, id);
    if (!r.ok) throw new Error(r.error);
    p.entities = r.entities;
  }
  return p;
}

function set(values: RecordNode, type: string, iri: string, value: string) {
  const form = forms[type];
  const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === iri)!;
  values[fieldKey(f)][0].value = value;
}

/** What FDPlight publishes for `p`, in one store, as the Index holds it after harvesting. */
async function published(p: Project, edit: (path: string, type: string, values: RecordNode) => void = () => {}) {
  const store = new oxigraph.Store();
  for (const e of p.entities) {
    const path = pathOf(p, e);
    const iri = iriOf(p, e);
    const values = normalizeRecord(forms[e.type], {});
    set(values, e.type, DCT.title, `Title of ${path}`);
    if (e.type.startsWith('dataservice')) set(values, e.type, `${NS.dct}type`, EDAM_SERVICE);
    edit(path, e.type, values);
    const g = serializeEntity(p, stamp(e, new Date('2026-10-23T00:00:00Z')), userGraphFromForm(forms[e.type], iri, values));
    store.load(await toTurtle(g, iri), { format: 'text/turtle', base_iri: iri });
  }
  return store;
}

const rows = (store: InstanceType<typeof oxigraph.Store>, q: string) =>
  (store.query(q) as Map<string, { value: string }>[]).map((b) => ({
    resource: b.get('resource')!.value.slice(BASE.length),
    type: b.get('ResourceType')?.value,
  }));

describe('VP Level 1 and Level 2 queries over an ERDERA project', () => {
  it('Level 1 lists the FDP and every record that is not a data service, with its type', async () => {
    const found = rows(await published(allTypes()), LEVEL1).sort((a, b) => a.resource.localeCompare(b.resource));
    expect(found).toEqual([
      { resource: 'biobank/bb.ttl', type: 'Biobank' },
      { resource: 'catalog/rare.ttl', type: 'Catalog' },
      { resource: 'dataset/ds.ttl', type: 'Dataset' },
      { resource: 'distribution/dist.ttl', type: 'Distribution' },
      { resource: 'fdp.ttl', type: 'FAIRDataPoint' },
      { resource: 'guideline/gl.ttl', type: 'Guideline' },
      { resource: 'patientregistry/reg.ttl', type: 'PatientRegistry' },
    ]);
  });

  it('Level 2 lists both kinds of data service, which need a dct:type', async () => {
    const p = allTypes();
    expect(rows(await published(p), LEVEL2).map((r) => r.resource).sort()).toEqual(['dataservice/access.ttl', 'dataservice2/api.ttl']);
    // ERDERA's shapes leave dct:type optional; without it Level 2 does not list the service.
    const untyped = await published(p, (path, type, values) => {
      if (path === 'dataservice2/api.ttl') set(values, type, `${NS.dct}type`, '');
    });
    expect(rows(untyped, LEVEL2).map((r) => r.resource)).toEqual(['dataservice/access.ttl']);
  });

  it('a hidden record removes every result from the graph the query runs on (the filter is not tied to ?resource)', async () => {
    const store = await published(allTypes(), (path, type, values) => {
      if (path === 'guideline/gl.ttl') set(values, type, `${EJP}vpConnection`, 'ejp:VPInvisible');
    });
    expect(store.match(null, oxigraph.namedNode(`${EJP}vpConnection`), oxigraph.namedNode(`${EJP}VPInvisible`), null)).toHaveLength(1);
    expect(rows(store, LEVEL1)).toEqual([]);
    expect(rows(store, LEVEL2)).toEqual([]);
  });
});
