// Rebuild a project from its files (SPEC §4.1, §5.7; TASKS Phase 4): the tree
// from the containers (fallback dct:isPartOf), timestamps from the metadata
// timestamps, form values from the record engine, and every triple the form
// has no place for kept to be written back.

import { importRecords, normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import { parseRdf, type Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import { entityIri, filePath } from './iri';
import type { ProjectFile } from './profile';
import type { Entity, Project } from './project';
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

interface Parsed {
  entity: Entity;
  path: string;
  iri: string;
  quads: Quad[];
  title: string;
}

/**
 * SPEC §4.1. `files` maps paths relative to the project folder to their
 * Turtle. Entity files are `fdp.ttl` and `{urlPrefix}/{id}.ttl` for the
 * profile's prefixes; anything else is ignored.
 */
export function loadProject(settings: ProjectFile, files: Map<string, string>, forms: Record<string, Schema>): LoadedProject {
  const report: string[] = [];
  const byPrefix = new Map(settings.types.map((t) => [t.urlPrefix, t]));
  const parsed: Parsed[] = [];

  for (const [path, ttl] of files) {
    const m = path === 'fdp.ttl' ? ['', '', ''] : /^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\.ttl$/.exec(path);
    const type = m ? byPrefix.get(m[1]) : undefined;
    if (!m || !type || filePath(type.urlPrefix, m[2]) !== path) continue;
    const r = parseRdf(ttl, 'turtle');
    if (r.error) {
      report.push(`${path}: not valid Turtle (${r.error}); skipped`);
      continue;
    }
    const iri = entityIri(settings, type.urlPrefix, m[2]);
    const on = (pred: string) => r.quads.filter((q) => q.subject.value === iri && q.predicate.value === pred);
    const types = new Set(on(RDF_TYPE).map((q) => q.object.value));
    const missing = type.targetClasses.filter((c) => !types.has(c));
    if (missing.length) report.push(`${path}: not typed as every class of ${type.name} (missing ${missing.join(', ')})`);
    const lit = (pred: string) => on(pred)[0]?.object.value;
    parsed.push({
      entity: { type: type.key, id: m[2], parent: null, issued: lit(FDP.metadataIssued), modified: lit(FDP.metadataModified) },
      path,
      iri,
      quads: r.quads,
      title: pickTitle(on(DCT.title).map((q) => q.object as never)) ?? '',
    });
  }

  // Tree: the parent's containers win; dct:isPartOf is the fallback (SPEC §4.1).
  const byIri = new Map(parsed.map((p) => [p.iri, p]));
  const parentOf = new Map<string, string>();
  for (const p of parsed) {
    const containers = p.quads.filter((q) => q.predicate.value === LDP.membershipResource && q.object.value === p.iri).map((q) => q.subject.value);
    for (const c of p.quads)
      if (c.predicate.value === LDP.contains && containers.includes(c.subject.value) && byIri.has(c.object.value))
        parentOf.set(c.object.value, p.path);
  }
  for (const p of parsed) {
    const up = p.quads.find((q) => q.subject.value === p.iri && q.predicate.value === DCT.isPartOf)?.object.value;
    const upPath = up ? byIri.get(up)?.path : undefined;
    const fromContainer = parentOf.get(p.iri);
    if (fromContainer && upPath && upPath !== fromContainer)
      report.push(`${p.path}: dct:isPartOf points to ${upPath} but ${fromContainer} lists it; using ${fromContainer}`);
    p.entity.parent = p.path === 'fdp.ttl' ? null : (fromContainer ?? upPath ?? null);
    if (p.path !== 'fdp.ttl' && !p.entity.parent) report.push(`${p.path}: no parent found`);
  }

  // Order: root first, then depth first; siblings by title, then id (SPEC §4.1).
  const children = (path: string | null) =>
    parsed
      .filter((p) => p.entity.parent === path && p.path !== 'fdp.ttl')
      .sort((a, b) => a.title.localeCompare(b.title) || a.entity.id.localeCompare(b.entity.id));
  const ordered: Parsed[] = [];
  const visit = (p: Parsed) => {
    ordered.push(p);
    for (const c of children(p.path)) visit(c);
  };
  const root = parsed.find((p) => p.path === 'fdp.ttl');
  if (root) visit(root);
  else report.push('fdp.ttl: missing, the project has no root');
  for (const p of parsed) if (!ordered.includes(p)) ordered.push(p); // orphans stay visible

  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  for (const p of ordered) {
    const form = forms[p.entity.type];
    const imp = importRecords(files.get(p.path)!, 'turtle', form);
    const rec = imp.records.find((r) => r.subject === p.iri);
    values[p.path] = rec ? rec.values : normalizeRecord(form, {});
    if (!rec) report.push(`${p.path}: no metadata for ${p.iri} could be read`);
    // Other records of the same class in the file are not this entity's
    // metadata: keep their triples verbatim too.
    const others = new Set(imp.records.filter((r) => r.subject !== p.iri && r.subject).map((r) => r.subject));
    if (others.size) report.push(`${p.path}: ${others.size} other record(s) in the file are kept as they are`);
    const kept = new Set(imp.unmappedQuads);
    extras[p.path] = [...imp.unmappedQuads, ...p.quads.filter((q) => others.has(q.subject.value) && !kept.has(q))];
  }

  return { project: { ...settings, entities: ordered.map((p) => p.entity) }, values, extras, report };
}
