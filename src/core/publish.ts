// What a publish writes (SPEC §4, §7.1): every file of the project, stamped,
// compared with what the repository has, as one set of changes.

import type { RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import type { FileChange } from '../github/client';
import { userGraphFromForm } from './forms';
import { FORMAT_VERSION, stringifyProjectFile } from './profile';
import { iriOf, pathOf, stamp, type Entity, type Project } from './project';
import { serializeEntity, toTurtle } from './wiring';

export interface PublishInput {
  project: Project;
  forms: Record<string, Schema>;
  values: Record<string, RecordNode>;
  /** Merged SHACL per type key, written to `shapes/{key}.ttl`. */
  shapes: Record<string, string>;
  /** Current repository contents by path (null or absent = no such file). */
  remote: Map<string, string | null>;
  /** All file paths currently in the repository. */
  remoteFiles: string[];
  now: Date;
}

export interface PublishPlan {
  /** The project's entities with the timestamps of this publish. */
  entities: Entity[];
  changes: FileChange[];
  added: string[];
  updated: string[];
  removed: string[];
  message: string;
}

async function entityTurtle(input: PublishInput, e: Entity): Promise<string> {
  const iri = iriOf(input.project, e);
  const user = userGraphFromForm(input.forms[e.type], iri, input.values[pathOf(input.project, e)] ?? {});
  return toTurtle(serializeEntity(input.project, e, user), iri);
}

/**
 * SPEC §5.2, §7.1. The files of a publish. Timestamps: a new entity gets
 * `issued` = `modified` = now; an existing one gets a new `modified` only when
 * its file would change, which also covers parents whose children changed.
 */
export async function planPublish(input: PublishInput): Promise<PublishPlan> {
  const { project, remote, now } = input;
  const files = new Map<string, string>();
  const entities: Entity[] = [];

  for (const e of project.entities) {
    const path = pathOf(project, e);
    let stamped = e.issued && e.modified ? e : stamp(e, now);
    let ttl = await entityTurtle(input, stamped);
    if (e.issued && e.modified && remote.get(path) !== ttl) {
      stamped = stamp(e, now);
      ttl = await entityTurtle(input, stamped);
    }
    entities.push(stamped);
    files.set(path, ttl);
  }

  // SPEC §3.1: settings and profile; the tree itself is not stored (§4.1).
  files.set(
    'fdplight.json',
    stringifyProjectFile({
      fdplight: FORMAT_VERSION,
      name: project.name,
      base: project.base,
      iriMode: project.iriMode,
      storageBase: project.storageBase,
      defaults: project.defaults,
      types: project.types,
      ...(project.source ? { source: project.source } : {}),
    }),
  );
  for (const t of project.types) files.set(t.shapes, input.shapes[t.key]);

  const changes: FileChange[] = [];
  const added: string[] = [];
  const updated: string[] = [];
  for (const [path, content] of files) {
    const before = remote.get(path) ?? null;
    if (before === content) continue;
    changes.push({ path, content });
    (before === null && !input.remoteFiles.includes(path) ? added : updated).push(path);
  }

  // SPEC §4: entity files FDPlight owns that are no longer in the project.
  const prefixes = project.types.map((t) => t.urlPrefix).filter(Boolean);
  const owned = (p: string) => p === 'fdp.ttl' || prefixes.some((x) => new RegExp(`^${x}/[^/]+\\.ttl$`).test(p));
  const removed = input.remoteFiles.filter((p) => owned(p) && !files.has(p));
  for (const path of removed) changes.push({ path, content: null });

  const entityLines = (verb: string, paths: string[]) => paths.filter((p) => p.endsWith('.ttl') && !p.startsWith('shapes/')).map((p) => `- ${verb} ${p}`);
  const lines = [...entityLines('add', added), ...entityLines('update', updated), ...entityLines('remove', removed)];
  const count = lines.length;
  const message = `FDPlight: ${count ? `publish ${count} ${count === 1 ? 'entity' : 'entities'}` : 'update project settings'}\n\n${lines.join('\n')}`.trim() + '\n';
  return { entities, changes, added, updated, removed, message };
}
