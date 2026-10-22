import { pathOf, type Project } from '../project';
import { addChild, moveEntity, moveTargets, removeEntity, renameEntity, subtree } from '../tree';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

const paths = (p: Project) => p.entities.map((e) => pathOf(p, e));
const apply = (p: Project, r: ReturnType<typeof addChild>): Project => {
  if (!r.ok) throw new Error(r.error);
  return { ...p, entities: r.entities };
};

describe('tree edits (TASKS Phase 3)', () => {
  it('lists a subtree parents first', () => {
    expect(subtree(defaultProject(FILE_MODE), 'catalog/rare-diseases.ttl')).toEqual([
      'catalog/rare-diseases.ttl',
      'dataset/registry-2024.ttl',
      'dataset/empty-set.ttl',
      'distribution/registry-csv.ttl',
    ]);
  });

  it('adds a child with a minted or given id, only where the profile allows it', () => {
    const p = defaultProject(FILE_MODE);
    const r = addChild(p, 'catalog/rare-diseases.ttl', 'dataset');
    expect(r.ok && r.path).toMatch(/^dataset\/[a-z2-7]{8}\.ttl$/);
    expect(paths(apply(p, addChild(p, 'fdp.ttl', 'catalog', 'second')))).toContain('catalog/second.ttl');
    expect(addChild(p, 'fdp.ttl', 'dataset')).toEqual({ ok: false, error: 'a fdp cannot contain a dataset' });
    expect(addChild(p, 'fdp.ttl', 'catalog', 'rare-diseases')).toEqual({ ok: false, error: 'catalog/rare-diseases.ttl already exists' });
    expect(addChild(p, 'fdp.ttl', 'catalog', 'Bad Id').ok).toBe(false);
    expect(addChild(p, 'nope.ttl', 'catalog').ok).toBe(false);
  });

  it('removes an entity with everything below it, never the root', () => {
    const p = defaultProject(FILE_MODE);
    expect(paths(apply(p, removeEntity(p, 'dataset/registry-2024.ttl')))).toEqual([
      'fdp.ttl',
      'catalog/rare-diseases.ttl',
      'dataset/empty-set.ttl',
    ]);
    expect(removeEntity(p, 'fdp.ttl')).toEqual({ ok: false, error: 'the root cannot be removed' });
  });

  it('renames an id and moves the children along', () => {
    const p = defaultProject(FILE_MODE);
    const r = renameEntity(p, 'dataset/registry-2024.ttl', 'registry');
    expect(r.ok && r.path).toBe('dataset/registry.ttl');
    const q = apply(p, r);
    expect(q.entities.find((e) => e.type === 'distribution')!.parent).toBe('dataset/registry.ttl');
    expect(p.entities.find((e) => e.type === 'distribution')!.parent).toBe('dataset/registry-2024.ttl'); // input untouched
    expect(renameEntity(p, 'dataset/registry-2024.ttl', 'empty-set').ok).toBe(false);
    expect(renameEntity(p, 'fdp.ttl', 'x').ok).toBe(false);
  });

  it('lists where an entity can move: allowed parents, not itself or below it', () => {
    const p = apply(defaultProject(FILE_MODE), addChild(defaultProject(FILE_MODE), 'fdp.ttl', 'catalog', 'other'));
    expect(moveTargets(p, 'dataset/registry-2024.ttl')).toEqual(['catalog/rare-diseases.ttl', 'catalog/other.ttl']);
    expect(moveTargets(p, 'distribution/registry-csv.ttl')).toEqual(['dataset/registry-2024.ttl', 'dataset/empty-set.ttl']);
    expect(moveTargets(p, 'catalog/rare-diseases.ttl')).toEqual(['fdp.ttl']);
    expect(moveTargets(p, 'fdp.ttl')).toEqual([]);
  });

  it('moves an entity with its subtree; file and IRI stay', () => {
    const p0 = defaultProject(FILE_MODE);
    const p = apply(p0, addChild(p0, 'fdp.ttl', 'catalog', 'other'));
    const r = moveEntity(p, 'dataset/registry-2024.ttl', 'catalog/other.ttl');
    expect(r.ok && r.path).toBe('dataset/registry-2024.ttl');
    const q = apply(p, r);
    expect(subtree(q, 'catalog/other.ttl')).toEqual(['catalog/other.ttl', 'dataset/registry-2024.ttl', 'distribution/registry-csv.ttl']);
    expect(subtree(q, 'catalog/rare-diseases.ttl')).toEqual(['catalog/rare-diseases.ttl', 'dataset/empty-set.ttl']);
    expect(p.entities.find((e) => e.id === 'registry-2024')!.parent).toBe('catalog/rare-diseases.ttl'); // input untouched
  });

  it('refuses moves the profile or the tree does not allow', () => {
    const p = defaultProject(FILE_MODE);
    expect(moveEntity(p, 'fdp.ttl', 'catalog/rare-diseases.ttl')).toEqual({ ok: false, error: 'the root cannot be moved' });
    expect(moveEntity(p, 'dataset/registry-2024.ttl', 'fdp.ttl')).toEqual({ ok: false, error: 'a fdp cannot contain a dataset' });
    expect(moveEntity(p, 'catalog/rare-diseases.ttl', 'catalog/rare-diseases.ttl')).toEqual({ ok: false, error: 'an entity cannot be moved below itself' });
    expect(moveEntity(p, 'dataset/registry-2024.ttl', 'nope.ttl').ok).toBe(false);
    const same = moveEntity(p, 'dataset/empty-set.ttl', 'catalog/rare-diseases.ttl');
    expect(same.ok && same.entities).toBe(p.entities);
  });
});
