import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm } from '../forms';
import { loadProject } from '../load';
import { pathOf, type Entity, type Project } from '../project';
import { planPublish } from '../publish';
import { DCT, NS } from '../vocab';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

const forms = Object.fromEntries(FDP_DEFAULT.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
const T1 = new Date('2026-10-22T10:00:00.000Z');
const T2 = new Date('2026-11-01T10:00:00.000Z');

function filled(): { project: Project; values: Record<string, RecordNode> } {
  const project = defaultProject(FILE_MODE);
  project.entities = project.entities.map(({ issued: _i, modified: _m, ...e }) => e as Entity);
  const values: Record<string, RecordNode> = {};
  for (const e of project.entities) {
    const form = forms[e.type];
    const v = normalizeRecord(form, {});
    for (const f of shapeFields(form)) {
      const iri = expandTerm(f.path, form.prefixes);
      const entry = v[fieldKey(f)][0];
      if (iri === DCT.title) Object.assign(entry, { value: `Title of ${e.id || 'root'}`, lang: 'en' });
      if (iri === `${NS.dcat}version`) entry.value = '1.0';
      if (iri === `${NS.dct}publisher` && entry.node) entry.node[Object.keys(entry.node)[0]][0].value = 'UT';
    }
    values[pathOf(project, e)] = v;
  }
  return { project, values };
}

const publish = (project: Project, values: Record<string, RecordNode>, remote: Map<string, string | null>, now: Date, extras = {}) =>
  planPublish({ project, forms, values, extras, shapes: FDP_DEFAULT.shapes, remote, remoteFiles: [...remote.keys()], now });

async function published() {
  const { project, values } = filled();
  const plan = await publish(project, values, new Map(), T1);
  const files = new Map(plan.changes.map((c) => [c.path, c.content!]));
  const { entities: _e, ...settings } = project;
  return { project, plan, files, settings };
}

describe('loadProject (SPEC §4.1, §5.7)', () => {
  it('round-trips: load what was published, publish again, nothing changes', async () => {
    const { plan, files, settings } = await published();
    const loaded = loadProject(settings, files, forms);
    expect(loaded.report).toEqual([]);
    expect(loaded.project.entities).toEqual(plan.entities.slice().sort((a, b) => order(a) - order(b)));
    const again = await publish(loaded.project, loaded.values, new Map(files), T2, loaded.extras);
    expect(again.changes).toEqual([]);
  });

  it('rebuilds the tree from the containers and orders siblings by title', async () => {
    const { files, settings } = await published();
    const loaded = loadProject(settings, files, forms);
    const paths = loaded.project.entities.map((e) => pathOf(loaded.project, e));
    // "Title of empty-set" sorts before "Title of registry-2024".
    expect(paths).toEqual(['fdp.ttl', 'catalog/rare-diseases.ttl', 'dataset/empty-set.ttl', 'dataset/registry-2024.ttl', 'distribution/registry-csv.ttl']);
    expect(loaded.project.entities.find((e) => e.type === 'distribution')!.parent).toBe('dataset/registry-2024.ttl');
  });

  it('keeps triples the form has no place for and writes them back', async () => {
    const { files, settings } = await published();
    const E = `${FILE_MODE.base}dataset/empty-set.ttl`;
    files.set('dataset/empty-set.ttl', files.get('dataset/empty-set.ttl')! + `\n<${E}> <https://example.org/unknown> "kept" .\n`);
    const loaded = loadProject(settings, files, forms);
    expect(loaded.extras['dataset/empty-set.ttl'].some((q) => q.predicate.value === 'https://example.org/unknown')).toBe(true);
    const again = await publish(loaded.project, loaded.values, new Map(files), T2, loaded.extras);
    const out = again.changes.find((c) => c.path === 'dataset/empty-set.ttl')!.content!;
    expect(out).toContain('<https://example.org/unknown> "kept"');
    expect(out).toContain('dct:title "Title of empty-set"@en');
  });

  it('reports a dct:isPartOf that disagrees with the containers, and uses the container', async () => {
    const { files, settings } = await published();
    const ds = files.get('dataset/empty-set.ttl')!.replace(`dct:isPartOf <${FILE_MODE.base}catalog/rare-diseases.ttl>`, `dct:isPartOf <${FILE_MODE.base}fdp.ttl>`);
    files.set('dataset/empty-set.ttl', ds);
    const loaded = loadProject(settings, files, forms);
    expect(loaded.report).toEqual(['dataset/empty-set.ttl: dct:isPartOf points to fdp.ttl but catalog/rare-diseases.ttl lists it; using catalog/rare-diseases.ttl']);
    expect(loaded.project.entities.find((e) => e.id === 'empty-set')!.parent).toBe('catalog/rare-diseases.ttl');
  });

  it('ignores non-entity files and reports unlinked or broken ones', async () => {
    const { files, settings } = await published();
    files.set('README.md', '# hi');
    files.set('dataset/stray.ttl', '<a> <b> <c> .');
    let loaded = loadProject(settings, files, forms);
    expect(loaded.report).toEqual(['dataset/stray.ttl: not linked from the tree; left out']);
    expect(loaded.project.entities).toHaveLength(5);

    files.set('distribution/registry-csv.ttl', '<a> <b> .');
    loaded = loadProject(settings, files, forms);
    expect(loaded.report[0]).toMatch(/^distribution\/registry-csv\.ttl: not valid Turtle/);
    expect(loaded.project.entities).toHaveLength(4);
  });
});

const ORDER = ['fdp.ttl', 'catalog/rare-diseases.ttl', 'dataset/empty-set.ttl', 'dataset/registry-2024.ttl', 'distribution/registry-csv.ttl'];
const order = (e: Entity) => ORDER.indexOf(e.type === 'fdp' ? 'fdp.ttl' : `${e.type}/${e.id}.ttl`);
