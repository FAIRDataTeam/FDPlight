// Rebuild a project from its files (SPEC §4.1, §4.2, §5.7; TASKS Phase 4).
// The tree is crawled from the root file the way the Index harvests: the
// parent's LDP containers, else its child relations. Each child's type is the
// one its parent's relation implies. Timestamps come from the metadata
// timestamps, form values from the record engine, and every triple the form
// has no place for is kept to be written back.

import { expandTerm, importRecords, normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import { parseRdf, type Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import { Store } from 'n3';
import { filePath, hashIri, isValidId } from './iri';
import { rootType, typeByKey, typeInUse, type EntityType, type ProjectFile } from './profile';
import { iriOf, type Entity, type Project } from './project';
import { DATACITE_IDENTIFIER, DCT, FDP, LDP, RDF_TYPE } from './vocab';
import { isRegenerated, pickTitle, serializeEntity } from './wiring';
import { say } from './messages';

/** What became of one file's triples (TASKS Phase 4 import report). */
export interface FileCounts {
  /** Triples in the file. */
  total: number;
  /** Read into the form. */
  mapped: number;
  /** Wiring FDPlight writes anew on save (SPEC §5.2 to 5.5, §5.7). */
  regenerated: number;
  /** No place in the form: written back as they are (SPEC §5.7). */
  kept: number;
}

export interface LoadedProject {
  project: Project;
  values: Record<string, RecordNode>;
  /** Unmapped triples per entity path, written back on publish (SPEC §5.7). */
  extras: Record<string, Quad[]>;
  /** What did not fit: shown to the user, never silently dropped. */
  report: string[];
  /** Per entity path, in tree order. */
  counts: Record<string, FileCounts>;
}

interface Node {
  entity: Entity;
  path: string;
  iri: string;
  quads: Quad[];
  title: string;
}

/** The entity for a file path: FDPlight's layout when it fits, else a kept path. */
function entityAt(type: EntityType, path: string, parent: string | null): Entity {
  if (type.urlPrefix === '' && path === 'fdp.ttl') return { type: type.key, id: '', parent };
  const m = /^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\.ttl$/.exec(path);
  if (m && m[1] === type.urlPrefix && isValidId(m[2]) && filePath(type.urlPrefix, m[2]) === path) return { type: type.key, id: m[2], parent };
  const base = path.replace(/^.*\//, '').replace(/\.ttl$/, '');
  return { type: type.key, id: base, parent, path };
}

/**
 * SPEC §4.1, §4.2. `files` maps paths relative to the project folder to their
 * Turtle. The crawl starts at `settings.root` (default `fdp.ttl`).
 */
export function loadProject(settings: ProjectFile, files: Map<string, string>, forms: Record<string, Schema>): LoadedProject {
  const report: string[] = [];
  const project: Project = { ...settings, entities: [] };
  const nodes: Node[] = [];
  const seen = new Map<string, string>(); // path -> parent path

  /** Path of an IRI under the base, or null. */
  const pathOfIri = (iri: string): string | null => {
    if (!iri.startsWith(settings.base)) return null;
    const rel = iri.slice(settings.base.length).replace(/#.*$/, '');
    if (!rel) return settings.iriMode === 'redirect' ? 'fdp.ttl' : null;
    return settings.iriMode === 'file' ? (rel.endsWith('.ttl') ? rel : null) : `${rel}.ttl`;
  };

  const queue: { path: string; types: EntityType[]; parent: string | null }[] = [
    { path: settings.root ?? 'fdp.ttl', types: [rootType(settings.types)], parent: null },
  ];
  while (queue.length) {
    const { path, types: candidates, parent } = queue.shift()!;
    const ttl = files.get(path);
    if (ttl === undefined) {
      report.push(parent === null ? say('notInRepositoryRoot', { path }) : say('notInRepository', { path, from: parent }));
      continue;
    }
    const r = parseRdf(ttl, 'turtle');
    if (r.error) {
      report.push(say('notTurtleSkipped', { path, error: r.error }));
      continue;
    }
    // Several child types can share a relation (ERDERA's dct:hasPart): the
    // file's path prefix decides, else its rdf:type (SPEC §4.1).
    const probe = iriOf(project, entityAt(candidates[0], path, parent));
    const type = pickType(candidates, path, new Set(r.quads.filter((q) => q.subject.value === probe && q.predicate.value === RDF_TYPE).map((q) => q.object.value)));
    const entity = entityAt(type, path, parent);
    const iri = iriOf(project, entity);
    const on = (pred: string) => r.quads.filter((q) => q.subject.value === iri && q.predicate.value === pred);
    if (!r.quads.some((q) => q.subject.value === iri)) report.push(say('describesNothing', { path, iri }));
    const types = new Set(on(RDF_TYPE).map((q) => q.object.value));
    const missing = type.targetClasses.filter((c) => !types.has(c));
    if (missing.length) report.push(say('missingClasses', { path, type: type.name, classes: missing.join(', ') }));
    const up = on(DCT.isPartOf)[0]?.object.value;
    const parentIri = parent === null ? null : nodes.find((n) => n.path === parent)?.iri;
    if (up && parentIri && up !== parentIri)
      report.push(say('isPartOfMismatch', { path, up: pathOfIri(up) ?? up, parent: parent ?? '' }));
    entity.issued = on(FDP.metadataIssued)[0]?.object.value;
    entity.modified = on(FDP.metadataModified)[0]?.object.value;
    nodes.push({ entity, path, iri, quads: r.quads, title: pickTitle(on(DCT.title).map((q) => q.object as never)) ?? '' });
    project.entities.push(entity);

    for (const [t, childTypes] of candidatesByTarget(childLinks(r.quads, iri, type, settings.types))) {
      const childPath = pathOfIri(t);
      if (!childPath) {
        report.push(say('linkOutside', { path, target: t }));
        continue;
      }
      const already = seen.get(childPath);
      if (already !== undefined) {
        if (already !== path) report.push(say('listedTwice', { path: childPath, first: already, second: path }));
        continue;
      }
      seen.set(childPath, path);
      queue.push({ path: childPath, types: childTypes, parent: path });
    }
  }

  // Files in FDPlight's layout that nothing links to.
  const prefixes = settings.types.map((t) => t.urlPrefix).filter(Boolean);
  for (const p of files.keys())
    if (prefixes.some((x) => new RegExp(`^${x}/[^/]+\\.ttl$`).test(p)) && !nodes.some((n) => n.path === p))
      report.push(say('notLinked', { path: p }));

  report.push(...wiringProblems(nodes, settings.base));

  // Order: depth first from the root; siblings by title, then id (SPEC §4.1).
  const ordered: Node[] = [];
  const visit = (n: Node) => {
    ordered.push(n);
    nodes
      .filter((c) => c.entity.parent === n.path)
      .sort((a, b) => a.title.localeCompare(b.title) || a.entity.id.localeCompare(b.entity.id))
      .forEach(visit);
  };
  if (nodes[0]) visit(nodes[0]);
  else report.push(say('rootUnreadable', { path: settings.root ?? 'fdp.ttl' }));
  project.entities = ordered.map((n) => n.entity);
  // Records of a type the settings leave out: the project uses that type after all.
  for (const key of new Set(project.entities.map((e) => e.type)))
    if (!typeInUse(project, key)) {
      project.use = [...(project.use ?? []), key];
      report.push(say('typeBackInUse', { type: typeByKey(project.types, key).name }));
    }
  if (project.entities[0]?.path) project.root = project.entities[0].path;

  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  const counts: Record<string, FileCounts> = {};
  for (const n of ordered) {
    const form = forms[n.entity.type];
    const rec = readRecord(files.get(n.path)!, n.quads, n.iri, form);
    values[n.path] = rec.values;
    extras[n.path] = rec.extras;
    if (!rec.found) report.push(say('noMetadata', { path: n.path, iri: n.iri }));
    if (rec.others) report.push(say('othersKept', { path: n.path, n: rec.others }));

    // Regenerated: wiring, or a kept triple identical to one FDPlight adds
    // anyway (default access rights, profile conformance and label).
    const wiring = isRegenerated(project, n.entity, new Store(n.quads as never));
    const epoch = new Date(0).toISOString(); // timestamps are wiring; any value will do
    const stamped = { ...n.entity, issued: n.entity.issued ?? epoch, modified: n.entity.modified ?? epoch };
    const own = new Set([...serializeEntity(project, stamped, new Store())].map(quadKey));
    const keptCount = extras[n.path].filter((q) => !wiring(q) && !own.has(quadKey(q))).length;
    const regenerated = n.quads.filter(wiring).length + extras[n.path].filter((q) => !wiring(q) && own.has(quadKey(q))).length;
    counts[n.path] = { total: n.quads.length, mapped: n.quads.length - regenerated - keptCount, regenerated, kept: keptCount };
  }

  return { project, values, extras, report, counts };
}

/**
 * Hand-made wiring that a save replaces, named so the user knows why those
 * files change: container IRIs shared by files for different parents, and
 * identifier nodes that do not match `fdp:metadataIdentifier`.
 */
function wiringProblems(nodes: Node[], base: string): string[] {
  const out: string[] = [];
  const short = (iri: string) => (iri.startsWith(base) ? iri.slice(base.length) || iri : iri);
  const containers = new Map<string, { path: string; member: string }[]>();
  for (const n of nodes) {
    for (const q of n.quads) {
      if (q.predicate.value !== LDP.membershipResource || q.subject.termType !== 'NamedNode') continue;
      const list = containers.get(q.subject.value) ?? [];
      list.push({ path: n.path, member: q.object.value });
      containers.set(q.subject.value, list);
    }

    const declared = n.quads.find((q) => q.subject.value === n.iri && q.predicate.value === FDP.metadataIdentifier)?.object.value;
    const nodesFor = n.quads
      .filter((q) => q.predicate.value === DCT.identifier && q.object.value === n.iri && q.subject.termType === 'NamedNode')
      .map((q) => q.subject.value)
      .filter((x) => n.quads.some((q) => q.subject.value === x && q.predicate.value === RDF_TYPE && q.object.value === DATACITE_IDENTIFIER));
    const odd = nodesFor.filter((x) => x !== declared);
    const fresh = hashIri(n.iri, 'identifier');
    if (odd.length)
      out.push(
        declared
          ? say('identifierReplaced', { path: n.path, nodes: odd.map(short).join(', '), declared: short(declared), fresh: short(fresh) })
          : say('identifierReplacedNone', { path: n.path, nodes: odd.map(short).join(', '), fresh: short(fresh) }),
      );
    else if (declared && !nodesFor.includes(declared))
      out.push(say('identifierMissing', { path: n.path, declared: short(declared), fresh: short(fresh) }));
  }
  for (const [iri, list] of containers) {
    const paths = [...new Set(list.map((x) => x.path))];
    if (paths.length > 1 && new Set(list.map((x) => x.member)).size > 1)
      out.push(say('containerShared', { iri: short(iri), paths: paths.join(', ') }));
  }
  return out;
}

function quadKey(q: { subject: { value: string }; predicate: { value: string }; object: { termType: string; value: string } }): string {
  const o = q.object as { termType: string; value: string; language?: string; datatype?: { value: string } };
  return [q.subject.value, q.predicate.value, o.termType, o.value, o.language ?? '', o.datatype?.value ?? ''].join('\u0000');
}

/**
 * SPEC §4.1. The children an entity lists, per child type of its profile type:
 * members of the containers it is the membership resource of, then the
 * objects of its child relations (the Index's fallback), without duplicates.
 */
export function childLinks(quads: Quad[], iri: string, type: EntityType, types: EntityType[]): { childType: EntityType; targets: string[] }[] {
  return type.children.map((spec) => {
    const containers = new Set(
      quads
        .filter((q) => q.predicate.value === LDP.membershipResource && q.object.value === iri)
        .map((q) => q.subject.value)
        .filter((c) => quads.some((q) => q.subject.value === c && q.predicate.value === LDP.hasMemberRelation && q.object.value === spec.relation)),
    );
    const targets = [
      ...quads.filter((q) => containers.has(q.subject.value) && q.predicate.value === LDP.contains).map((q) => q.object.value),
      ...quads.filter((q) => q.subject.value === iri && q.predicate.value === spec.relation).map((q) => q.object.value),
    ];
    return { childType: typeByKey(types, spec.type), targets: [...new Set(targets)] };
  });
}

/**
 * SPEC §5.7. One entity's form values from its file, and the triples the form
 * has no place for (kept verbatim), including other records in the file.
 */
export function readRecord(text: string, quads: Quad[], iri: string, form: Schema): { values: RecordNode; extras: Quad[]; found: boolean; others: number } {
  // The record engine reads subjects typed with the form's primary class:
  // assert it on the entity, so hand-made files typed otherwise still map.
  const primary = expandTerm(form.targetClass, form.prefixes);
  const imp = importRecords(text + (primary ? `\n<${iri}> <${RDF_TYPE}> <${primary}> .\n` : ''), 'turtle', form);
  const rec = imp.records.find((x) => x.subject === iri);
  // Other records of the same class are not this entity's metadata: keep them.
  const others = new Set(imp.records.filter((x) => x.subject !== iri && x.subject).map((x) => x.subject));
  const kept = new Set(imp.unmappedQuads);
  return {
    values: rec ? rec.values : normalizeRecord(form, {}),
    extras: [...imp.unmappedQuads, ...quads.filter((q) => others.has(q.subject.value) && !kept.has(q))],
    found: !!rec,
    others: others.size,
  };
}

/** Child IRIs with the types their parent's relations allow, in profile order. */
export function candidatesByTarget(links: { childType: EntityType; targets: string[] }[]): Map<string, EntityType[]> {
  const out = new Map<string, EntityType[]>();
  for (const { childType, targets } of links)
    for (const t of targets) out.set(t, [...(out.get(t) ?? []), childType]);
  return out;
}

/**
 * SPEC §4.1. The type of a child among the candidates its parent's relation
 * allows: the one whose URL prefix the file path uses (FDPlight's layout),
 * else the most specific one whose target classes the record has, else the
 * first.
 */
export function pickType(candidates: EntityType[], path: string | null, classes: Set<string>): EntityType {
  if (candidates.length === 1) return candidates[0];
  const byPath = path && candidates.find((t) => t.urlPrefix && path.startsWith(`${t.urlPrefix}/`));
  if (byPath) return byPath;
  const typed = candidates
    .filter((t) => t.targetClasses.every((c) => classes.has(c)))
    .sort((a, b) => b.targetClasses.length - a.targetClasses.length);
  return typed[0] ?? candidates[0];
}
