// Edits of the entity tree (TASKS Phase 3). Pure functions: each returns a new
// entity list and leaves the input untouched. Wiring is derived from the
// result on save (SPEC §5.5).

import { filePath, isValidId, mintId } from './iri';
import { typeByKey } from './profile';
import { findByPath, pathOf, type Entity, type Project } from './project';

export type TreeResult = { ok: true; entities: Entity[]; path: string } | { ok: false; error: string };

/** Paths of `path` and all its descendants, parents before children. */
export function subtree(p: Project, path: string): string[] {
  const out = [path];
  for (let i = 0; i < out.length; i++)
    for (const e of p.entities) if (e.parent === out[i]) out.push(pathOf(p, e));
  return out;
}

/**
 * Add a child of `childType` under the entity at `parentPath`, with a fresh
 * id (SPEC §2.3) unless `id` is given. The profile must allow the child type.
 */
export function addChild(p: Project, parentPath: string, childType: string, id: string = mintId()): TreeResult {
  const parent = findByPath(p, parentPath);
  if (!parent) return { ok: false, error: `no entity at ${parentPath}` };
  if (!typeByKey(p.types, parent.type).children.some((c) => c.type === childType))
    return { ok: false, error: `a ${parent.type} cannot contain a ${childType}` };
  const prefix = typeByKey(p.types, childType).urlPrefix;
  const path = filePath(prefix, id);
  if (!isValidId(id)) return { ok: false, error: `"${id}" is not a valid id (lowercase letters, digits and "-")` };
  if (findByPath(p, path)) return { ok: false, error: `${path} already exists` };
  return { ok: true, entities: [...p.entities, { type: childType, id, parent: parentPath }], path };
}

/** Remove the entity at `path` and everything below it. The root cannot be removed. */
export function removeEntity(p: Project, path: string): TreeResult {
  const e = findByPath(p, path);
  if (!e) return { ok: false, error: `no entity at ${path}` };
  if (e.parent === null) return { ok: false, error: 'the root cannot be removed' };
  const gone = new Set(subtree(p, path));
  return { ok: true, entities: p.entities.filter((x) => !gone.has(pathOf(p, x))), path };
}

/**
 * SPEC §2.3. Give the entity at `path` a new id (slug). Its children follow.
 * Only allowed before the first publish; the caller enforces that.
 */
export function renameEntity(p: Project, path: string, newId: string): TreeResult {
  const e = findByPath(p, path);
  if (!e) return { ok: false, error: `no entity at ${path}` };
  if (e.parent === null) return { ok: false, error: 'the root file is always fdp.ttl' };
  if (e.path) return { ok: false, error: 'an imported entity keeps its file name and IRI' };
  if (!isValidId(newId)) return { ok: false, error: `"${newId}" is not a valid id (lowercase letters, digits and "-")` };
  const newPath = filePath(typeByKey(p.types, e.type).urlPrefix, newId);
  if (newPath === path) return { ok: true, entities: p.entities, path };
  if (findByPath(p, newPath)) return { ok: false, error: `${newPath} already exists` };
  const entities = p.entities.map((x) => {
    if (x === e) return { ...x, id: newId };
    if (x.parent === path) return { ...x, parent: newPath };
    return x;
  });
  return { ok: true, entities, path: newPath };
}

/**
 * Entities that may become the parent of the entity at `path`: the profile
 * allows its type there, and it is not the entity itself or below it. The
 * current parent is included.
 */
export function moveTargets(p: Project, path: string): string[] {
  const e = findByPath(p, path);
  if (!e || e.parent === null) return [];
  const below = new Set(subtree(p, path));
  return p.entities
    .filter((x) => typeByKey(p.types, x.type).children.some((c) => c.type === e.type))
    .map((x) => pathOf(p, x))
    .filter((x) => !below.has(x));
}

/**
 * Move the entity at `path`, with everything below it, under `newParent`.
 * Its file and IRI stay the same (they depend on its type and id only); the
 * old and new parents' containers and its `dct:isPartOf` follow on save
 * (SPEC §5.5).
 */
export function moveEntity(p: Project, path: string, newParent: string): TreeResult {
  const e = findByPath(p, path);
  if (!e) return { ok: false, error: `no entity at ${path}` };
  if (e.parent === null) return { ok: false, error: 'the root cannot be moved' };
  const target = findByPath(p, newParent);
  if (!target) return { ok: false, error: `no entity at ${newParent}` };
  if (subtree(p, path).includes(newParent)) return { ok: false, error: 'an entity cannot be moved below itself' };
  if (!typeByKey(p.types, target.type).children.some((c) => c.type === e.type))
    return { ok: false, error: `a ${target.type} cannot contain a ${e.type}` };
  if (e.parent === newParent) return { ok: true, entities: p.entities, path };
  return { ok: true, entities: p.entities.map((x) => (x === e ? { ...x, parent: newParent } : x)), path };
}
