// Rebuild a project from its files (SPEC §4.1, §4.2, §5.7; TASKS Phase 4).
// The tree is crawled from the root file the way the Index harvests: the
// parent's LDP containers, else its child relations. Each child's type is the
// one its parent's relation implies. Timestamps come from the metadata
// timestamps, form values from the record engine, and every triple the form
// has no place for is kept to be written back.

import { expandTerm, importRecords, normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import { parseRdf, type Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import { filePath, isValidId } from './iri';
import { rootType, typeByKey, type EntityType, type ProjectFile } from './profile';
import { iriOf, type Entity, type Project } from './project';
import { DCT, FDP, LDP, RDF_TYPE } from './vocab';
import { pickTitle } from './wiring';

export interface LoadedProject {
  project: Project;
  values: Record<string, RecordNode>;
  /** Unmapped triples per entity path, written back on publish (SPEC §5.7). */
  extras: Record<string, Quad[]>;
  /** What did not fit: shown to the user, never silently dropped. */
  report: string[];
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
  }

  return { project, values, extras, report };
}
