import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm } from '../forms';
import { pathOf, type Entity, type Project } from '../project';
import { planPublish, type PublishPlan } from '../publish';
import { DCT } from '../vocab';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

const forms = Object.fromEntries(FDP_DEFAULT.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
const T1 = new Date('2026-10-22T10:00:00.000Z');
const T2 = new Date('2026-10-23T10:00:00.000Z');

function fresh(): { project: Project; values: Record<string, RecordNode> } {
  const project = defaultProject(FILE_MODE);
  project.entities = project.entities.map(({ issued: _i, modified: _m, ...e }) => e as Entity);
  const values = Object.fromEntries(project.entities.map((e) => [pathOf(project, e), normalizeRecord(forms[e.type], {})]));
  return { project, values };
}

/** The repository after applying a plan on top of `before`. */
function applied(before: Map<string, string | null>, plan: PublishPlan): Map<string, string | null> {
  const after = new Map(before);
  for (const c of plan.changes) {
    if (c.content === null) after.delete(c.path);
    else after.set(c.path, c.content);
  }
  return after;
}

const run = (project: Project, values: Record<string, RecordNode>, remote: Map<string, string | null>, now: Date) =>
  planPublish({ project, forms, values, shapes: FDP_DEFAULT.shapes, remote, remoteFiles: [...remote.keys()], now });

function setTitle(values: Record<string, RecordNode>, path: string, type: string, title: string) {
  const f = shapeFields(forms[type]).find((x) => expandTerm(x.path, forms[type].prefixes) === DCT.title)!;
  values[path][fieldKey(f)][0].value = title;
}

describe('planPublish (SPEC §4, §5.2, §7.1)', () => {
  it('first publish: every file is added and every entity stamped now', async () => {
    const { project, values } = fresh();
    const plan = await run(project, values, new Map(), T1);
    expect(plan.added).toEqual([
      'fdp.ttl',
      'catalog/rare-diseases.ttl',
      'dataset/registry-2024.ttl',
      'dataset/empty-set.ttl',
      'distribution/registry-csv.ttl',
      'fdplight.json',
      'shapes/fdp.ttl',
      'shapes/catalog.ttl',
      'shapes/dataset.ttl',
      'shapes/distribution.ttl',
    ]);
    expect(plan.entities.every((e) => e.issued === T1.toISOString() && e.modified === T1.toISOString())).toBe(true);
    expect(plan.message).toMatch(/^FDPlight: publish 5 entities\n\n- add fdp.ttl\n/);
    const json = JSON.parse(plan.changes.find((c) => c.path === 'fdplight.json')!.content!);
    expect(json.entities).toBeUndefined(); // the tree is derived from the files (SPEC §4.1)
    expect(json.base).toBe(FILE_MODE.base);
  });

  it('publishing again without edits changes nothing', async () => {
    const { project, values } = fresh();
    const first = await run(project, values, new Map(), T1);
    project.entities = first.entities;
    const again = await run(project, values, applied(new Map(), first), T2);
    expect(again.changes).toEqual([]);
    expect(again.entities).toEqual(first.entities);
  });

  it('an edit restamps only the edited entity; issued is kept', async () => {
    const { project, values } = fresh();
    const first = await run(project, values, new Map(), T1);
    project.entities = first.entities;
    setTitle(values, 'dataset/empty-set.ttl', 'dataset', 'Empty set');
    const second = await run(project, values, applied(new Map(), first), T2);
    expect(second.updated).toEqual(['dataset/empty-set.ttl']);
    const ds = second.entities.find((e) => e.id === 'empty-set')!;
    expect([ds.issued, ds.modified]).toEqual([T1.toISOString(), T2.toISOString()]);
    expect(second.changes[0].content).toContain('fdp:metadataModified "2026-10-23T10:00:00.000Z"');
  });

  it('adding and removing children restamps the parents, adds and deletes files', async () => {
    const { project, values } = fresh();
    const first = await run(project, values, new Map(), T1);
    project.entities = first.entities.filter((e) => e.id !== 'registry-csv');
    project.entities.push({ type: 'dataset', id: 'new-one', parent: 'catalog/rare-diseases.ttl' });
    values['dataset/new-one.ttl'] = normalizeRecord(forms.dataset, {});
    const second = await run(project, values, applied(new Map(), first), T2);
    expect(second.added).toEqual(['dataset/new-one.ttl']);
    expect(second.updated.sort()).toEqual(['catalog/rare-diseases.ttl', 'dataset/registry-2024.ttl']);
    expect(second.removed).toEqual(['distribution/registry-csv.ttl']);
    expect(second.changes.find((c) => c.path === 'distribution/registry-csv.ttl')!.content).toBeNull();
  });

  it('never deletes files it does not own', async () => {
    const { project, values } = fresh();
    const remote = new Map<string, string | null>([['README.md', '# hi'], ['docs/notes.ttl', ''], ['catalog/sub/x.ttl', '']]);
    const plan = await run(project, values, remote, T1);
    expect(plan.removed).toEqual([]);
  });
});
