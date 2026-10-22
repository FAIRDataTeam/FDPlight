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
import { rootType, typeByKey, type EntityType, type ProjectFile } from './profile';
import { iriOf, type Entity, type Project } from './project';
import { DATACITE_IDENTIFIER, DCT, FDP, LDP, RDF_TYPE } from './vocab';
import { isRegenerated, pickTitle, serializeEntity } from './wiring';

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

  const queue: { path: string; type: EntityType; parent: string | null }[] = [
    { path: settings.root ?? 'fdp.ttl', type: rootType(settings.types), parent: null },
  ];
  while (queue.length) {
    const { path, type, parent } = queue.shift()!;
    const ttl = files.get(path);
    if (ttl === undefined) {
      report.push(`${path}: linked from ${parent ?? 'the settings'} but not in the repository`);
      continue;
    }
    const r = parseRdf(ttl, 'turtle');
    if (r.error) {
      report.push(`${path}: not valid Turtle (${r.error}); skipped`);
      continue;
    }
    const entity = entityAt(type, path, parent);
    const iri = iriOf(project, entity);
    const on = (pred: string) => r.quads.filter((q) => q.subject.value === iri && q.predicate.value === pred);
    if (!r.quads.some((q) => q.subject.value === iri)) report.push(`${path}: describes nothing about ${iri}`);
    const types = new Set(on(RDF_TYPE).map((q) => q.object.value));
    const missing = type.targetClasses.filter((c) => !types.has(c));
    if (missing.length) report.push(`${path}: not typed as every class of ${type.name} (adding ${missing.join(', ')} on save)`);
    const up = on(DCT.isPartOf)[0]?.object.value;
    const parentIri = parent === null ? null : nodes.find((n) => n.path === parent)?.iri;
    if (up && parentIri && up !== parentIri)
      report.push(`${path}: dct:isPartOf points to ${pathOfIri(up) ?? up} but ${parent} lists it; using ${parent}`);
    entity.issued = on(FDP.metadataIssued)[0]?.object.value;
    entity.modified = on(FDP.metadataModified)[0]?.object.value;
    nodes.push({ entity, path, iri, quads: r.quads, title: pickTitle(on(DCT.title).map((q) => q.object as never)) ?? '' });
    project.entities.push(entity);

    // Children: containers this entity is the membership resource of, then
    // its direct child relations (the Index's fallback).
    for (const spec of type.children) {
      const childType = typeByKey(settings.types, spec.type);
      const containers = new Set(
        r.quads
          .filter((q) => q.predicate.value === LDP.membershipResource && q.object.value === iri)
          .map((q) => q.subject.value)
          .filter((c) => r.quads.some((q) => q.subject.value === c && q.predicate.value === LDP.hasMemberRelation && q.object.value === spec.relation)),
      );
      const targets = [
        ...r.quads.filter((q) => containers.has(q.subject.value) && q.predicate.value === LDP.contains).map((q) => q.object.value),
        ...on(spec.relation).map((q) => q.object.value),
      ];
      for (const t of [...new Set(targets)]) {
        const childPath = pathOfIri(t);
        if (!childPath) {
          report.push(`${path}: links to ${t}, which is not a file under the base URI; left out`);
          continue;
        }
        const already = seen.get(childPath);
        if (already !== undefined) {
          if (already !== path) report.push(`${childPath}: listed by ${already} and ${path}; kept under ${already}`);
          continue;
        }
        seen.set(childPath, path);
        queue.push({ path: childPath, type: childType, parent: path });
      }
    }
  }

  // Files in FDPlight's layout that nothing links to.
  const prefixes = settings.types.map((t) => t.urlPrefix).filter(Boolean);
  for (const p of files.keys())
    if (prefixes.some((x) => new RegExp(`^${x}/[^/]+\\.ttl$`).test(p)) && !nodes.some((n) => n.path === p))
      report.push(`${p}: not linked from the tree; left out`);

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
  else report.push(`${settings.root ?? 'fdp.ttl'}: the root could not be read`);
  project.entities = ordered.map((n) => n.entity);
  if (project.entities[0]?.path) project.root = project.entities[0].path;

  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  const counts: Record<string, FileCounts> = {};
  for (const n of ordered) {
    const form = forms[n.entity.type];
    // The record engine reads subjects typed with the form's primary class:
    // assert it on the entity, so hand-made files typed otherwise still map.
    const primary = expandTerm(form.targetClass, form.prefixes);
    const text = files.get(n.path)! + (primary ? `\n<${n.iri}> <${RDF_TYPE}> <${primary}> .\n` : '');
    const imp = importRecords(text, 'turtle', form);
    const rec = imp.records.find((x) => x.subject === n.iri);
    values[n.path] = rec ? rec.values : normalizeRecord(form, {});
    if (!rec) report.push(`${n.path}: no metadata for ${n.iri} could be read`);
    // Other records of the same class are not this entity's metadata: keep them.
    const others = new Set(imp.records.filter((x) => x.subject !== n.iri && x.subject).map((x) => x.subject));
    if (others.size) report.push(`${n.path}: ${others.size} other record(s) in the file are kept as they are`);
    const kept = new Set(imp.unmappedQuads);
    extras[n.path] = [...imp.unmappedQuads, ...n.quads.filter((q) => others.has(q.subject.value) && !kept.has(q))];

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
      out.push(`${n.path}: identifier node ${odd.map(short).join(', ')} is not the one fdp:metadataIdentifier points to (${declared ? short(declared) : 'none'}); replaced by ${short(fresh)}`);
    else if (declared && !nodesFor.includes(declared))
      out.push(`${n.path}: fdp:metadataIdentifier points to ${short(declared)}, which the file does not describe; replaced by ${short(fresh)}`);
  }
  for (const [iri, list] of containers) {
    const paths = [...new Set(list.map((x) => x.path))];
    if (paths.length > 1 && new Set(list.map((x) => x.member)).size > 1)
      out.push(`container ${short(iri)} is declared in ${paths.join(' and ')} for different parents; each file gets its own container on save`);
  }
  return out;
}

function quadKey(q: { subject: { value: string }; predicate: { value: string }; object: { termType: string; value: string } }): string {
  const o = q.object as { termType: string; value: string; language?: string; datatype?: { value: string } };
  return [q.subject.value, q.predicate.value, o.termType, o.value, o.language ?? '', o.datatype?.value ?? ''].join('\u0000');
}
