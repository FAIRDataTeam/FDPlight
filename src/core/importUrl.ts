// Copy a running FAIR Data Point into the project by its URL only (SPEC §4.3,
// TASKS Phase 4, decided 2026-10-23). FDPlight crawls the FDP the way the
// Index does, gives every record a new IRI under the project base, and links
// each one to its old IRI with prov:wasDerivedFrom.

import { expandTerm, fieldKey, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import { DataFactory, Parser, Writer } from 'n3';
import { iriRewriter, slug } from './import';
import { childLinks, readRecord, type LoadedProject } from './load';
import { rootType, type EntityType, type ProjectFile } from './profile';
import { iriOf, pathOf, type Entity, type Project } from './project';
import { DCT, NS } from './vocab';
import { pickTitle } from './wiring';

export const PROV_WAS_DERIVED_FROM = 'http://www.w3.org/ns/prov#wasDerivedFrom';

export type TurtleFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  text(): Promise<string>;
}>;

export interface UrlImportInput {
  /** The FDP's root URL, e.g. https://w3id.org/simpathic/fdp */
  rootUrl: string;
  /** The target project's settings: base, IRI mode, folder, defaults, types. */
  settings: ProjectFile;
  forms: Record<string, Schema>;
  fetchFn?: TurtleFetch;
  /** Stop after this many records. */
  maxEntities?: number;
}

export type UrlImportResult = { ok: true; loaded: LoadedProject } | { ok: false; error: string };

interface Fetched {
  iri: string;
  type: EntityType;
  parent: string | null;
  text: string;
  quads: Quad[];
  title: string;
}

/** N-Triples of parsed quads, so relative IRIs in the source are resolved once. */
function ntriples(quads: Quad[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Writer({ format: 'N-Triples' });
    w.addQuads(quads as never);
    w.end((err, out) => (err ? reject(err) : resolve(out ?? '')));
  });
}

/** SPEC §4.3. Crawl the FDP at `rootUrl` and turn it into a project with new IRIs. */
export async function importFromUrl(input: UrlImportInput): Promise<UrlImportResult> {
  const fetchFn = input.fetchFn ?? (fetch as unknown as TurtleFetch);
  const max = input.maxEntities ?? 500;
  const { settings } = input;
  const report: string[] = [];
  const fetched: Fetched[] = [];
  const seen = new Set<string>();
  const queue: { iri: string; type: EntityType; parent: string | null }[] = [
    { iri: input.rootUrl.trim(), type: rootType(settings.types), parent: null },
  ];
  seen.add(queue[0].iri);

  while (queue.length) {
    const { iri, type, parent } = queue.shift()!;
    if (fetched.length >= max) {
      report.push(`Stopped after ${max} records; ${queue.length + 1} more were not copied`);
      break;
    }
    let res: Awaited<ReturnType<TurtleFetch>>;
    try {
      res = await fetchFn(iri, { headers: { Accept: 'text/turtle' } });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (parent === null) return { ok: false, error: `${iri} could not be read (${why}); the server may not allow browser access (CORS)` };
      report.push(`${iri}: could not be read (${why}); left out`);
      continue;
    }
    if (!res.ok) {
      if (parent === null) return { ok: false, error: `${iri} answered HTTP ${res.status}` };
      report.push(`${iri}: HTTP ${res.status}; left out`);
      continue;
    }
    let quads: Quad[];
    try {
      quads = new Parser({ baseIRI: res.url || iri }).parse(await res.text()) as unknown as Quad[];
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (parent === null) return { ok: false, error: `${iri} is not Turtle (${why})` };
      report.push(`${iri}: not Turtle (${why}); left out`);
      continue;
    }
    // The record is about the IRI asked for (as the Index assumes), or about
    // the address a redirect led to.
    const subject = [iri, res.url].find((c) => c && quads.some((q) => q.subject.value === c));
    if (!subject) {
      if (parent === null) return { ok: false, error: `${iri} does not describe itself; is it the root of a FAIR Data Point?` };
      report.push(`${iri}: does not describe itself; left out`);
      continue;
    }
    const titles = quads.filter((q) => q.subject.value === subject && q.predicate.value === DCT.title).map((q) => q.object);
    fetched.push({ iri: subject, type, parent, text: await ntriples(quads), quads, title: pickTitle(titles as never) ?? '' });

    const known = new Set(type.children.map((c) => c.relation));
    for (const { childType, targets } of childLinks(quads, subject, type, settings.types))
      for (const t of targets) {
        if (seen.has(t)) continue;
        seen.add(t);
        queue.push({ iri: t, type: childType, parent: subject });
      }
    // Children this profile has no type for.
    const other = quads.filter(
      (q) => q.predicate.value === `${NS.ldp}hasMemberRelation` && !known.has(q.object.value) &&
        quads.some((x) => x.subject.equals(q.subject) && x.predicate.value === `${NS.ldp}membershipResource` && x.object.value === subject),
    );
    for (const c of other) {
      const n = quads.filter((q) => q.subject.equals(c.subject) && q.predicate.value === `${NS.ldp}contains`).length;
      if (n) report.push(`${subject}: ${n} record(s) linked by ${c.object.value} are not in this profile; left out`);
    }
  }

  // ---- entities in FDPlight's layout ----
  const project: Project = { ...settings, entities: [] };
  delete project.root;
  const byIri = new Map<string, Entity>();
  const taken = new Set<string>();
  const ordered: Fetched[] = [];
  const visit = (f: Fetched) => {
    ordered.push(f);
    fetched
      .filter((c) => c.parent === f.iri)
      .sort((a, b) => a.title.localeCompare(b.title) || a.iri.localeCompare(b.iri))
      .forEach(visit);
  };
  visit(fetched[0]);
  for (const f of ordered) {
    let entity: Entity;
    if (f.parent === null) entity = { type: f.type.key, id: '', parent: null };
    else {
      const last = f.iri.replace(/[#?].*$/, '').replace(/\/+$/, '').split('/').pop()!.replace(/\.ttl$/, '');
      let id = slug(last);
      for (let n = 2; taken.has(`${f.type.key}/${id}`); n++) id = `${slug(last)}-${n}`;
      taken.add(`${f.type.key}/${id}`);
      entity = { type: f.type.key, id, parent: pathOf(project, byIri.get(f.parent)!) };
    }
    byIri.set(f.iri, entity);
    project.entities.push(entity);
  }

  // ---- metadata, with the old IRIs rewritten ----
  const iriMap = new Map(ordered.map((f) => [f.iri, iriOf(project, byIri.get(f.iri)!)]));
  const rw = iriRewriter(iriMap);
  const values: Record<string, RecordNode> = {};
  const extras: Record<string, Quad[]> = {};
  let serverTriples = 0;
  for (const f of ordered) {
    const e = byIri.get(f.iri)!;
    const path = pathOf(project, e);
    const rec = readRecord(f.text, f.quads, f.iri, input.forms[e.type]);
    if (!rec.found) report.push(`${f.iri}: no metadata could be read into the form`);
    // What the source server generated about itself: its metric nodes, its
    // profile IRIs and (on the root) its API description. FDPlight writes its own.
    const sourceOwn = (q: Quad) =>
      q.subject.value.startsWith(`${f.iri}/metrics/`) ||
      q.object.value.startsWith(`${f.iri}/metrics/`) ||
      (q.predicate.value === DCT.conformsTo && /\/profile\/[^/]+$/.test(q.object.value) && !q.object.value.startsWith(settings.base)) ||
      (q.predicate.value === `${NS.rdfs}label` && /\/profile\/[^/]+$/.test(q.subject.value)) ||
      (f.parent === null && q.predicate.value === `${NS.dcat}endpointDescription`);
    const kept = rec.extras.filter((q) => !sourceOwn(q));
    serverTriples += rec.extras.length - kept.length;
    if (f.parent === null) serverTriples += clearSourceApi(rec.values, input.forms[e.type], f.iri);
    values[path] = rw.node(rec.values);
    extras[path] = [
      ...kept.map(rw.quad),
      DataFactory.quad(DataFactory.namedNode(iriMap.get(f.iri)!), DataFactory.namedNode(PROV_WAS_DERIVED_FROM), DataFactory.namedNode(f.iri)) as unknown as Quad,
    ];
    if (rec.others) report.push(`${f.iri}: ${rec.others} other record(s) in the response are kept as they are`);
  }
  if (serverTriples) report.push(`${serverTriples} triple(s) the source server generated about itself (metrics, profiles, API description) were left out; FDPlight writes its own`);
  report.unshift(
    `Copied ${ordered.length} record(s) from ${fetched[0].iri}. They get new IRIs under ${settings.base}; each links to its old IRI with prov:wasDerivedFrom.`,
  );
  return { ok: true, loaded: { project, values, extras, report, counts: {} } };
}

/** The source server's API description on the root is not true of the copy: clear it in the form. */
function clearSourceApi(values: RecordNode, form: Schema, rootIri: string): number {
  const origin = new URL(rootIri).origin;
  let n = 0;
  for (const f of shapeFields(form)) {
    if (expandTerm(f.path, form.prefixes) !== `${NS.dcat}endpointDescription`) continue;
    for (const entry of values[fieldKey(f)] ?? [])
      if (entry.value.startsWith(origin)) {
        entry.value = '';
        n++;
      }
  }
  return n;
}
