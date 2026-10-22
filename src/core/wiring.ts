// Builds the complete graph of one entity file: the user's metadata plus every
// triple the RI would add (SPEC §5.2 to 5.5), and writes it as clean Turtle
// (SPEC §4).

import { DataFactory, Store, Writer, type Quad, type Term } from 'n3';
import { containerIri, hashIri, profileIri } from './iri';
import { md5Hex } from './md5';
import { DEFAULT_ACCESS_RIGHTS, isCatalog, typeByKey, type EntityType } from './profile';
import { childrenOf, entityType, findByPath, iriOf, iriSettings, type Entity, type Project } from './project';
import { DATACITE_IDENTIFIER, DCAT, DCT, FDP, LDP, NS, RDFS_LABEL, RDF_TYPE, SIO, XSD_DATETIME } from './vocab';
import { FDPLIGHT_VERSION } from './version';

const { namedNode, literal, quad } = DataFactory;

const LDP_CONTAINER_TYPES = new Set([`${NS.ldp}Container`, `${NS.ldp}BasicContainer`, LDP.DirectContainer]);

export interface SerializeOptions {
  /** Software version written to `fdp:fdpSoftwareVersion` on the root (SPEC §5.4). */
  version?: string;
}

/**
 * SPEC §5.2 to 5.5. The full graph of one entity's file.
 *
 * `user` holds the entity's user metadata with subject `E` (SPEC §5.1),
 * possibly with nested hash-IRI or blank nodes (§5.6) and, after an import,
 * unmapped triples (§5.7). Triples that FDPlight regenerates are dropped from
 * it first, so the output never carries stale wiring. The entity must have
 * been stamped (`issued`, `modified`).
 */
export function serializeEntity(project: Project, entity: Entity, user: Store, opts: SerializeOptions = {}): Store {
  const type = entityType(project, entity);
  const s = iriSettings(project);
  const E = iriOf(project, entity);
  const e = namedNode(E);
  if (!entity.issued || !entity.modified) throw new Error(`entity ${E} has no timestamps; stamp it before saving`);

  const out = new Store();
  const add = (sub: Term, pred: string, obj: Term) => out.addQuad(quad(sub as never, namedNode(pred), obj as never));
  const userHas = (pred: string) => user.getQuads(e, namedNode(pred), null, null).length > 0;

  // ---- user metadata, minus what is regenerated below ----
  const catalog = isCatalog(type);
  const regenerated = new Set(generatedPaths(type));
  const childPrefixes = type.children.map((c) => typeByKey(project.types, c.type).urlPrefix);
  const generatedSubjects = new Set<string>([
    hashIri(E, 'identifier'),
    ...childPrefixes.map((p) => containerIri(s, E, p)),
    ...(userHas(DCT.accessRights) ? [] : [hashIri(E, 'accessRights')]),
    // Identifier nodes of E at any IRI (e.g. a hand-written typo): wiring.
    ...user
      .getQuads(null, namedNode(DCT.identifier), literal(E), null)
      .filter((q) => q.subject.termType === 'NamedNode' && user.has(quad(q.subject as never, namedNode(RDF_TYPE), namedNode(DATACITE_IDENTIFIER))))
      .map((q) => q.subject.value),
    // Any LDP container in the input is wiring (§5.5), e.g. a hand-written one
    // at an IRI FDPlight would not generate.
    ...user
      .getQuads(null, namedNode(RDF_TYPE), null, null)
      .filter((q) => q.subject.termType === 'NamedNode' && q.subject.value !== E && LDP_CONTAINER_TYPES.has(q.object.value))
      .map((q) => q.subject.value),
  ]);
  const metricsPrefix = `${E.endsWith('/') ? E.slice(0, -1) : E}/metrics/`;
  for (const q of user) {
    if (q.subject.equals(e) && regenerated.has(q.predicate.value)) continue;
    if (q.subject.termType === 'NamedNode' && (generatedSubjects.has(q.subject.value) || q.subject.value.startsWith(metricsPrefix)))
      continue;
    out.addQuad(q.subject, q.predicate, q.object, DataFactory.defaultGraph());
  }

  // ---- SPEC §5.2 system triples ----
  for (const c of type.targetClasses) add(e, RDF_TYPE, namedNode(c));

  const id = namedNode(hashIri(E, 'identifier'));
  add(e, FDP.metadataIdentifier, id);
  add(id, RDF_TYPE, namedNode(DATACITE_IDENTIFIER));
  add(id, DCT.identifier, literal(E));

  const label = pickTitle(user.getQuads(e, namedNode(DCT.title), null, null).map((q) => q.object));
  if (label !== null) add(e, RDFS_LABEL, literal(label));

  const d = project.defaults;
  if (d.language && !userHas(DCT.language)) add(e, DCT.language, namedNode(d.language));
  if (d.license && !userHas(DCT.license)) add(e, DCT.license, namedNode(d.license));
  if (!userHas(DCT.accessRights)) {
    const ar = namedNode(hashIri(E, 'accessRights'));
    add(e, DCT.accessRights, ar);
    add(ar, RDF_TYPE, namedNode(DCT.RightsStatement));
    add(ar, DCT.description, literal(d.accessRightsDescription ?? DEFAULT_ACCESS_RIGHTS));
  }

  const issued = literal(entity.issued, namedNode(XSD_DATETIME));
  const modified = literal(entity.modified, namedNode(XSD_DATETIME));
  add(e, FDP.metadataIssued, issued);
  add(e, FDP.metadataModified, modified);
  // SPEC §5.3 catalog-only
  if (catalog) {
    add(e, DCT.issued, issued);
    add(e, DCT.modified, modified);
  }

  if (entity.parent !== null) {
    const parent = findByPath(project, entity.parent);
    if (!parent) throw new Error(`entity ${E} has a parent ${entity.parent} that is not in the project`);
    add(e, DCT.isPartOf, namedNode(iriOf(project, parent)));
  }

  const profile = namedNode(profileIri(s, type.key));
  add(e, DCT.conformsTo, profile);
  add(profile, RDFS_LABEL, literal(`${type.name} Profile`));

  for (const m of d.metrics) {
    const node = namedNode(`${metricsPrefix}${md5Hex(m.metric)}`);
    add(e, SIO.refersTo, node);
    add(node, SIO.refersTo, namedNode(m.resource));
    add(node, SIO.isAbout, namedNode(m.resource));
  }

  // ---- SPEC §5.4 root-only ----
  if (type.urlPrefix === '') {
    add(e, FDP.fdpSoftwareVersion, literal(`FDPlight:${opts.version ?? FDPLIGHT_VERSION}`));
    add(e, DCAT.endpointURL, e);
  }

  // ---- SPEC §5.5 child links and one LDP container per child type ----
  type.children.forEach((child, i) => {
    const container = namedNode(containerIri(s, E, childPrefixes[i]));
    add(container, RDF_TYPE, namedNode(LDP.DirectContainer));
    add(container, DCT.title, literal(child.title));
    add(container, LDP.membershipResource, e);
    add(container, LDP.hasMemberRelation, namedNode(child.relation));
    for (const c of childrenOf(project, entity, child.type)) {
      const ci = namedNode(iriOf(project, c));
      add(e, child.relation, ci);
      add(container, LDP.contains, ci);
    }
  });

  return out;
}

/**
 * SPEC §5.7. The predicates on `E` that the wiring writes itself, replacing
 * whatever the input had. Forms hide them (TASKS Phase 2).
 */
export function generatedPaths(type: EntityType): string[] {
  return [
    RDF_TYPE,
    FDP.metadataIdentifier,
    RDFS_LABEL,
    FDP.metadataIssued,
    FDP.metadataModified,
    DCT.isPartOf,
    SIO.refersTo,
    // A hand-made ldp:BasicContainer on the entity itself (SPEC §5.5).
    LDP.contains,
    ...type.children.map((c) => c.relation),
    ...(isCatalog(type) ? [DCT.issued, DCT.modified] : []),
    ...(type.urlPrefix === '' ? [FDP.fdpSoftwareVersion, DCAT.endpointURL] : []),
  ];
}

/**
 * SPEC §5.2. The lexical form for `rdfs:label`: the first English title,
 * otherwise the first title in code-point order. null when there is none.
 */
export function pickTitle(titles: Term[]): string | null {
  const lits = titles.filter((t) => t.termType === 'Literal') as ReturnType<typeof literal>[];
  if (!lits.length) return null;
  const sorted = [...lits].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  const en = sorted.find((l) => l.language === 'en' || l.language.startsWith('en-'));
  return (en ?? sorted[0]).value;
}

// ---------- Turtle output (SPEC §4) ----------

const termOrder = (t: Term): string => `${t.termType === 'Literal' ? 1 : 0}${t.value}`;

/**
 * SPEC §4. Clean, deterministic Turtle: only the prefixes actually used,
 * the entity's own subject first, then the others in IRI order; `rdf:type`
 * first within a subject.
 */
export async function toTurtle(store: Store, mainSubject?: string): Promise<string> {
  const quads = canonicalBlankNodes(store.getQuads(null, null, null, null));
  const used = Object.entries(NS).filter(([, ns]) =>
    quads.some((q) =>
      // rdf:type as a predicate is written as "a" and needs no prefix.
      [q.subject, ...(q.predicate.value === RDF_TYPE ? [] : [q.predicate]), q.object].some(
        (t) => (t.termType === 'NamedNode' && t.value.startsWith(ns)) || (t.termType === 'Literal' && !t.language && t.datatype.value.startsWith(ns) && t.datatype.value !== `${NS.xsd}string`),
      ),
    ),
  );
  const sorted = [...quads].sort((a, b) => cmpQuad(a, b, mainSubject));
  const writer = new Writer({ prefixes: Object.fromEntries(used) });
  writer.addQuads(sorted);
  return new Promise((resolve, reject) => writer.end((err, result) => (err ? reject(err) : resolve(result ?? ''))));
}

/**
 * Blank node labels depend on how a graph was parsed, so the same graph could
 * be written differently each time. Relabel them `b0`, `b1`, … in an order
 * derived from their content: what each node states, then how it is
 * referenced. (Nodes with identical content get an arbitrary but harmless
 * order among themselves.)
 */
export function canonicalBlankNodes(quads: Quad[]): Quad[] {
  const term = (t: Term) => (t.termType === 'BlankNode' ? '_' : termOrder(t) + (t.termType === 'Literal' ? `@${(t as ReturnType<typeof literal>).language}^${(t as ReturnType<typeof literal>).datatype.value}` : ''));
  const sig = new Map<string, string[]>();
  const add = (b: Term, line: string) => {
    if (b.termType !== 'BlankNode') return;
    if (!sig.has(b.value)) sig.set(b.value, []);
    sig.get(b.value)!.push(line);
  };
  for (const q of quads) {
    add(q.subject, `>${q.predicate.value} ${term(q.object)}`);
    add(q.object, `<${term(q.subject)} ${q.predicate.value}`);
  }
  if (!sig.size) return quads;
  const order = [...sig.entries()].map(([id, lines]) => [id, lines.sort().join('\n')] as const).sort((a, b) => cmp(a[1], b[1]));
  const label = new Map(order.map(([id], i) => [id, DataFactory.blankNode(`b${i}`)]));
  const relabel = <T extends Term>(t: T): T => (t.termType === 'BlankNode' ? (label.get(t.value) as unknown as T) : t);
  return quads.map((q) => quad(relabel(q.subject) as never, q.predicate, relabel(q.object) as never, q.graph));
}

function cmpQuad(a: Quad, b: Quad, main?: string): number {
  const rank = (q: Quad) => (q.subject.value === main ? 0 : q.subject.termType === 'BlankNode' ? 2 : 1);
  return (
    rank(a) - rank(b) ||
    cmp(a.subject.value, b.subject.value) ||
    (a.predicate.value === RDF_TYPE ? 0 : 1) - (b.predicate.value === RDF_TYPE ? 0 : 1) ||
    cmp(a.predicate.value, b.predicate.value) ||
    cmp(termOrder(a.object), termOrder(b.object))
  );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
