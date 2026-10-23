// Open an FDP that FDPlight did not make (SPEC §4.2; TASKS Phase 4): a
// repository with Turtle files but no fdplight.json. The user points at the
// root file and chooses to keep the existing IRIs or migrate to FDPlight's
// layout.

import type { RecordNode } from '@fairdatateam/record-core/record';
import { DataFactory } from 'n3';
import type { Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import { parseRdf } from '@fairdatateam/record-core/rdf';
import { loadProject, type LoadedProject } from './load';
import { DEFAULT_ACCESS_RIGHTS, FORMAT_VERSION, type EntityType, type ProjectFile } from './profile';
import { iriOf, pathOf, type Entity } from './project';
import { DCT, FDP, R3D_REPOSITORY, RDF_TYPE } from './vocab';
import { pickTitle } from './wiring';
import { say } from './messages';

export type ImportMode = 'keep' | 'migrate';

export interface ImportInput {
  /** Repository path of the root file, e.g. sites/proqolid/eprovide_fdp.ttl */
  rootPath: string;
  /** Repository files (all paths), at least everything under the root's folder. */
  files: Map<string, string>;
  types: EntityType[];
  forms: Record<string, Schema>;
  mode: ImportMode;
}

export type ImportResult = { ok: true; loaded: LoadedProject } | { ok: false; error: string };

/** SPEC §4.2. Import the FDP whose root file is `rootPath`. */
export function importExistingFdp(input: ImportInput): ImportResult {
  const slash = input.rootPath.lastIndexOf('/');
  const folder = slash < 0 ? '' : input.rootPath.slice(0, slash + 1);
  const rootFile = input.rootPath.slice(folder.length);
  const text = input.files.get(input.rootPath);
  if (text === undefined) return { ok: false, error: say('rootNotInRepository', { path: input.rootPath }) };
  const parsed = parseRdf(text, 'turtle');
  if (parsed.error) return { ok: false, error: say('rootNotTurtle', { path: input.rootPath, error: parsed.error }) };

  // The root: a subject typed as an FDP whose IRI is the file's URL.
  const rootClasses = new Set([FDP.MetadataService, R3D_REPOSITORY, 'https://w3id.org/fdp/fdp-o#FAIRDataPoint']);
  const rootIri = parsed.quads.find(
    (q) => q.predicate.value === RDF_TYPE && rootClasses.has(q.object.value) && q.subject.termType === 'NamedNode' && q.subject.value.endsWith(`/${rootFile}`),
  )?.subject.value;
  if (!rootIri) return { ok: false, error: say('noFdpRoot', { path: input.rootPath, file: rootFile }) };
  const base = rootIri.slice(0, rootIri.length - rootFile.length);

  const title = pickTitle(parsed.quads.filter((q) => q.subject.value === rootIri && q.predicate.value === DCT.title).map((q) => q.object as never));
  const settings: ProjectFile = {
    fdplight: FORMAT_VERSION,
    name: title ?? 'Imported FAIR Data Point',
    base,
    iriMode: 'file',
    storageBase: null,
    // Imports keep what the files say: no default language or licence added.
    defaults: { language: null, license: null, accessRightsDescription: DEFAULT_ACCESS_RIGHTS, metrics: [] },
    types: input.types,
    ...(folder ? { folder } : {}),
    ...(rootFile !== 'fdp.ttl' ? { root: rootFile } : {}),
  };
  const relative = new Map<string, string>();
  for (const [p, t] of input.files) if (p.startsWith(folder)) relative.set(p.slice(folder.length), t);
  const loaded = loadProject(settings, relative, input.forms);
  return { ok: true, loaded: input.mode === 'migrate' ? migrate(loaded) : loaded };
}

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entity';

/**
 * SPEC §4.2. Move every kept-path entity to FDPlight's layout: a new id from
 * its file name, and every old IRI (and its hash IRIs) rewritten in the
 * values and the kept triples. The old files stay in the repository.
 */
export function migrate(loaded: LoadedProject): LoadedProject {
  const p = loaded.project;
  const before = p.entities.map((e) => ({ e, path: pathOf(p, e), iri: iriOf(p, e) }));
  const taken = new Set(p.entities.filter((e) => !e.path).map((e) => `${e.type}/${e.id}`));
  const moved: Entity[] = p.entities.map((e) => {
    if (!e.path) return { ...e };
    const { path: _old, ...rest } = e;
    if (e.parent === null) return { ...rest, id: '' };
    let id = slug(e.id);
    for (let n = 2; taken.has(`${e.type}/${id}`); n++) id = `${slug(e.id)}-${n}`;
    taken.add(`${e.type}/${id}`);
    return { ...rest, id };
  });
  const project = { ...p, entities: moved };
  delete project.root;
  const pathMap = new Map(before.map((b, i) => [b.path, pathOf(project, moved[i])]));
  const iriMap = new Map(before.map((b, i) => [b.iri, iriOf(project, moved[i])]));
  for (const e of moved) if (e.parent !== null) e.parent = pathMap.get(e.parent) ?? e.parent;

  const rw = iriRewriter(iriMap);
  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  const counts: LoadedProject['counts'] = {};
  for (const [old, now] of pathMap) {
    if (loaded.counts[old]) counts[now] = loaded.counts[old];
    values[now] = rw.node(loaded.values[old] ?? {});
    extras[now] = (loaded.extras[old] ?? []).map(rw.quad);
  }
  const left = before.filter((b) => b.path !== pathMap.get(b.path)).map((b) => b.path);
  const report = [...loaded.report];
  if (left.length) report.push(say('migrated', { paths: left.join(', ') }));
  return { project, values, extras, report, counts };
}

/**
 * SPEC §4.2. Rewrites old entity IRIs to new ones: exact IRIs, their hash
 * IRIs, and literals that are exactly an old IRI (e.g. `dct:identifier`).
 */
export function iriRewriter(iriMap: Map<string, string>, prefix?: { from: string; to: string }) {
  const iri = (v: string): string => {
    const exact = iriMap.get(v);
    if (exact) return exact;
    const hash = v.indexOf('#');
    const base = hash < 0 ? undefined : iriMap.get(v.slice(0, hash));
    if (base) return base + v.slice(hash);
    // SPEC §2.5: other IRIs under the old base (profile IRIs, …) move with it,
    // unless they are already under a new base that extends the old one.
    if (prefix && v.startsWith(prefix.from) && !(prefix.to.startsWith(prefix.from) && v.startsWith(prefix.to)))
      return prefix.to + v.slice(prefix.from.length);
    return v;
  };
  const node = (n: RecordNode): RecordNode =>
    Object.fromEntries(Object.entries(n).map(([k, list]) => [k, list.map((x) => ({ ...x, value: iri(x.value), ...(x.node ? { node: node(x.node) } : {}) }))]));
  const term = <T extends Quad['subject'] | Quad['object']>(t: T): T =>
    (t.termType === 'NamedNode'
      ? DataFactory.namedNode(iri(t.value))
      : t.termType === 'Literal' && iriMap.has(t.value)
        ? DataFactory.literal(iriMap.get(t.value)!, (t as unknown as { language: string }).language || (t as unknown as { datatype: never }).datatype)
        : t) as T;
  const quad = (q: Quad): Quad => DataFactory.quad(term(q.subject), q.predicate as never, term(q.object), q.graph as never) as unknown as Quad;
  return { iri, node, quad };
}
