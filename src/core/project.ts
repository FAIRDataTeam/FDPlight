// The in-memory project: settings plus the entity tree. The tree is the
// source of truth for all wiring (SPEC §5.5, TASKS key decision 4).

import { entityIri, filePath, type IriSettings } from './iri';
import { rootType, typeByKey, type EntityType, type ProjectFile } from './profile';

/** One metadata record, one file (SPEC §1). */
export interface Entity {
  /** Key of the entity type in the profile. */
  type: string;
  /** Minted id or slug (SPEC §2.3). Ignored for the root. */
  id: string;
  /** Repository path of the parent's file, null for the root. */
  parent: string | null;
  /** First save, ISO 8601 (SPEC §5.2 `fdp:metadataIssued`). */
  issued?: string;
  /** Last save, ISO 8601 (SPEC §5.2 `fdp:metadataModified`). */
  modified?: string;
}

export interface Project extends ProjectFile {
  /** Entities in display order. Children are listed in this order too. */
  entities: Entity[];
}

export function iriSettings(p: ProjectFile): IriSettings {
  return { base: p.base, iriMode: p.iriMode, storageBase: p.storageBase };
}

export function entityType(p: ProjectFile, e: Entity): EntityType {
  return typeByKey(p.types, e.type);
}

/** SPEC §4. Repository path of an entity's file; also its key within the project. */
export function pathOf(p: ProjectFile, e: Entity): string {
  return filePath(entityType(p, e).urlPrefix, e.id);
}

/** SPEC §2.3. */
export function iriOf(p: ProjectFile, e: Entity): string {
  return entityIri(iriSettings(p), entityType(p, e).urlPrefix, e.id);
}

export function findByPath(p: Project, path: string): Entity | undefined {
  return p.entities.find((e) => pathOf(p, e) === path);
}

export function rootOf(p: Project): Entity | undefined {
  const key = rootType(p.types).key;
  return p.entities.find((e) => e.type === key);
}

/** Children of `parent` of the given type, in project order. */
export function childrenOf(p: Project, parent: Entity, childType: string): Entity[] {
  const path = pathOf(p, parent);
  return p.entities.filter((e) => e.parent === path && e.type === childType);
}

/** SPEC §5.2. Timestamps for a save at `now`: issued is set once, modified every time. */
export function stamp(e: Entity, now: Date): Entity {
  const t = now.toISOString();
  return { ...e, issued: e.issued ?? t, modified: t };
}
