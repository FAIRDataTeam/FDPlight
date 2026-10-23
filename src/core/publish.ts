// What a publish writes (SPEC §4, §7.1): every file of the project, stamped,
// compared with what the repository has, as one set of changes.

import type { RecordNode } from '@fairdatateam/record-core/record';
import type { Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import type { FileChange } from '../github/client';
import { userGraphFromForm } from './forms';
import { PING_WORKFLOW_PATH, pingWorkflow } from './ping';
import { DEFAULT_ACCESS_RIGHTS, FORMAT_VERSION, stringifyProjectFile } from './profile';
import { iriOf, pathOf, rootOf, stamp, type Entity, type Project } from './project';
import { serializeEntity, toTurtle } from './wiring';

export interface PublishInput {
  project: Project;
  forms: Record<string, Schema>;
  values: Record<string, RecordNode>;
  /** Merged SHACL per type key, written to `shapes/{key}.ttl`. */
  shapes: Record<string, string>;
  /** Unmapped triples per entity path, kept from loaded files (SPEC §5.7). */
  extras?: Record<string, Quad[]>;
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
  const path = pathOf(input.project, e);
  const user = userGraphFromForm(input.forms[e.type], iri, input.values[path] ?? {}, input.extras?.[path]);
  return toTurtle(serializeEntity(input.project, e, user), iri);
}

/**
 * SPEC §5.2, §7.1. The files of a publish. Timestamps: a new entity gets
 * `issued` = `modified` = now; an existing one gets a new `modified` only when
 * its file would change, which also covers parents whose children changed.
 */
export async function planPublish(input: PublishInput): Promise<PublishPlan> {
  const { project, remote, now } = input;
  const folder = project.folder ?? '';
  const files = new Map<string, string>();
  const entities: Entity[] = [];

  for (const e of project.entities) {
    const path = folder + pathOf(project, e);
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
    `${folder}fdplight.json`,
    stringifyProjectFile({
      fdplight: FORMAT_VERSION,
      name: project.name,
      base: project.base,
      iriMode: project.iriMode,
      storageBase: project.storageBase,
      // As parseProjectFile reads it back, so a reload writes the same file.
      defaults: { ...project.defaults, accessRightsDescription: project.defaults.accessRightsDescription ?? DEFAULT_ACCESS_RIGHTS },
      types: project.types,
      ...(project.source ? { source: project.source } : {}),
      ...(folder ? { folder } : {}),
      ...(project.index ? { index: project.index } : {}),
      ...(project.root ? { root: project.root } : {}),
      ...(project.use ? { use: project.use } : {}),
    }),
  );
  for (const t of project.types) files.set(folder + t.shapes, input.shapes[t.key]);

  // SPEC §7.2: the ping workflow, regenerated so it always names the current root.
  const root = rootOf(project);
  if (project.index && root) files.set(PING_WORKFLOW_PATH, pingWorkflow(iriOf(project, root), project.index));

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
  const esc = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const owned = (p: string) => p === `${folder}fdp.ttl` || prefixes.some((x) => new RegExp(`^${esc}${x}/[^/]+\\.ttl$`).test(p));
  const removed = input.remoteFiles.filter((p) => owned(p) && !files.has(p));
  for (const path of removed) changes.push({ path, content: null });

  const entityLines = (verb: string, paths: string[]) =>
    paths.filter((p) => p.endsWith('.ttl') && !p.startsWith(`${folder}shapes/`)).map((p) => `- ${verb} ${p}`);
  const lines = [...entityLines('add', added), ...entityLines('update', updated), ...entityLines('remove', removed)];
  const count = lines.length;
  const message = `FDPlight: ${count ? `publish ${count} ${count === 1 ? 'entity' : 'entities'}` : 'update project settings'}\n\n${lines.join('\n')}`.trim() + '\n';
  return { entities, changes, added, updated, removed, message };
}
