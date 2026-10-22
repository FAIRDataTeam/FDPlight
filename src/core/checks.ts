// Structural checks before publish, SPEC §6 rules 2 to 7. Rule 1 (SHACL per
// entity) belongs to the validation phase and the shared record engine.

import type { Store } from 'n3';
import { rootType, typeByKey } from './profile';
import { findByPath, iriOf, pathOf, type Project } from './project';
import { FDP, LDP, R3D_REPOSITORY, RDF_TYPE } from './vocab';

export type Severity = 'error' | 'confirm';

export interface Issue {
  /** SPEC §6 rule number. */
  rule: number;
  severity: Severity;
  /** Repository path of the entity the issue is about, when there is one. */
  entity?: string;
  message: string;
}

/**
 * SPEC §6 rules 2 to 7 over a whole project. `graphs` maps each entity's
 * repository path to the graph that would be written for it (usually the
 * output of `serializeEntity`).
 */
export function checkProject(project: Project, graphs: Map<string, Store>): Issue[] {
  const issues: Issue[] = [];
  const push = (rule: number, severity: Severity, message: string, entity?: string) =>
    issues.push({ rule, severity, message, ...(entity !== undefined ? { entity } : {}) });

  const entityIris = new Map<string, string[]>(); // IRI -> paths
  for (const e of project.entities) {
    const iri = iriOf(project, e);
    entityIris.set(iri, [...(entityIris.get(iri) ?? []), pathOf(project, e)]);
  }

  // Rule 5: two entities share an IRI.
  for (const [iri, paths] of entityIris)
    if (paths.length > 1) push(5, 'error', `${paths.length} entities share the IRI ${iri}`, paths[0]);

  // Rule 4: every entity other than the root has a parent that may hold it.
  const rootKey = rootType(project.types).key;
  const roots = project.entities.filter((e) => e.type === rootKey);
  if (roots.length !== 1) push(4, 'error', `the project must have exactly one root entity (found ${roots.length})`);
  for (const e of project.entities) {
    const path = pathOf(project, e);
    if (e.type === rootKey) {
      if (e.parent !== null) push(4, 'error', 'the root entity cannot have a parent', path);
      continue;
    }
    const parent = e.parent === null ? undefined : findByPath(project, e.parent);
    if (!parent) {
      push(4, 'error', e.parent === null ? 'has no parent' : `its parent ${e.parent} is not in the project`, path);
      continue;
    }
    if (!typeByKey(project.types, parent.type).children.some((c) => c.type === e.type))
      push(4, 'error', `a ${parent.type} cannot contain a ${e.type}`, path);
  }

  const relations = new Set(project.types.flatMap((t) => t.children.map((c) => c.relation)));
  const containerOwners = new Map<string, string[]>();

  for (const [path, g] of graphs) {
    const named = new Set<string>();
    const subjects = new Set<string>();
    for (const q of g) {
      for (const t of [q.subject, q.predicate, q.object, ...(q.object.termType === 'Literal' ? [q.object.datatype] : [])])
        if (t.termType === 'NamedNode') named.add(t.value);
      if (q.subject.termType === 'NamedNode') subjects.add(q.subject.value);

      // Rule 3: link targets must be entities of the project.
      if ((q.predicate.value === LDP.contains || relations.has(q.predicate.value)) && !isEntity(q.object, entityIris))
        push(3, 'error', `links to ${q.object.value}, which has no file in the project`, path);

      if (q.predicate.value === RDF_TYPE && q.object.value === LDP.DirectContainer)
        containerOwners.set(q.subject.value, [...(containerOwners.get(q.subject.value) ?? []), path]);
    }

    // Rule 2: everything this file describes is under the base URI.
    for (const sub of subjects)
      if (!sub.startsWith(project.base)) push(2, 'confirm', `describes ${sub}, which is not under the base URI`, path);

    // Rule 6: malformed IRIs.
    for (const iri of named) {
      const problem = iriProblem(iri, project.base);
      if (problem) push(6, 'error', `malformed IRI ${JSON.stringify(iri)}: ${problem}`, path);
    }
  }

  // Rule 5: two files declare the same container.
  for (const [iri, paths] of containerOwners)
    if (new Set(paths).size > 1) push(5, 'error', `the container ${iri} is declared in ${[...new Set(paths)].join(', ')}`, paths[0]);

  // Rule 7: the root is typed so the Index can read it.
  const root = roots[0];
  if (root) {
    const path = pathOf(project, root);
    const g = graphs.get(path);
    const iri = iriOf(project, root);
    const typed = g?.getQuads(iri, RDF_TYPE, null, null).some((q) => q.object.value === FDP.MetadataService || q.object.value === R3D_REPOSITORY);
    if (!typed) push(7, 'error', 'the root must have rdf:type fdp:MetadataService or r3d:Repository', path);
  }

  return issues;
}

function isEntity(t: { termType: string; value: string }, entityIris: Map<string, string[]>): boolean {
  return t.termType === 'NamedNode' && entityIris.has(t.value);
}

/**
 * SPEC §6 rule 6. Why an IRI is malformed, or null when it is fine. IRIs under
 * `base` are FDPlight's own, so an empty fragment there is an error too.
 */
export function iriProblem(iri: string, base?: string): string | null {
  if (/[\s<>"{}|\\^`]/.test(iri)) return 'contains characters not allowed in IRIs';
  const hashes = iri.split('#').length - 1;
  if (hashes > 1) return 'has more than one "#"';
  if (hashes === 1 && iri.endsWith('#') && base && iri.startsWith(base)) return 'has an empty fragment';
  try {
    new URL(iri);
  } catch {
    return 'is not an absolute IRI';
  }
  return null;
}
