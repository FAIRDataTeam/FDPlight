// Per-entity SHACL check before publish (SPEC §6 rule 1): the full graph
// FDPlight would write for the entity, against the shapes of its type, with
// the shared record-core engine (shacl-engine, SHACL Core).

import { expandTerm, nestedShapeOf, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import { parseRdf, type Quad } from '@fairdatateam/record-core/rdf';
import { checkRecordShacl, type ShaclFinding } from '@fairdatateam/record-core/shaclCheck';
import type { Schema } from '@fairdatateam/record-core/types';
import type { Store } from 'n3';
import { withHashNodes } from './forms';

export type { ShaclFinding };

/** Parse a type's shapes once (Turtle). */
export function shapesGraph(ttl: string): Quad[] {
  const r = parseRdf(ttl, 'turtle');
  if (r.error) throw new Error(r.error);
  return r.quads;
}

/**
 * SPEC §6 rule 1. Findings for one entity. `graph` is the entity's complete
 * file graph (serializeEntity), so system triples such as the types and
 * timestamps count, exactly as the Index will see them; `form` and `values`
 * place the findings on form fields.
 */
export async function checkEntity(form: Schema, iri: string, values: RecordNode, graph: Store, shapes: Quad[]): Promise<ShaclFinding[]> {
  const extra = withoutFormBlankNodes(form, iri, graph.getQuads(null, null, null, null) as unknown as Quad[]);
  // The same values the file was built from, so both describe the same nodes.
  const r = await checkRecordShacl(form, iri, withHashNodes(form, iri, values), extra, shapes);
  return r.findings;
}

/**
 * SPEC §5.6, §6 rule 1. Sub-form values that stay blank nodes (e.g. ERDERA's
 * population coverage) are in the form values and in the file graph, under
 * different blank-node labels. Check them once, from the values, where the
 * findings land on the form: leave out of the graph the blank nodes the
 * entity links through a sub-form field, and everything below them.
 */
function withoutFormBlankNodes(form: Schema, iri: string, quads: Quad[]): Quad[] {
  const subForms = new Set(
    shapeFields(form)
      .filter((f) => !f.inversePath && nestedShapeOf(form, f))
      .map((f) => expandTerm(f.path, form.prefixes)),
  );
  const fromForm = (q: Quad) => q.subject.value === iri && q.subject.termType === 'NamedNode' && q.object.termType === 'BlankNode' && subForms.has(q.predicate.value);
  const drop = new Set(quads.filter(fromForm).map((q) => q.object.value));
  for (let grew = true; grew; ) {
    grew = false;
    for (const q of quads)
      if (q.subject.termType === 'BlankNode' && drop.has(q.subject.value) && q.object.termType === 'BlankNode' && !drop.has(q.object.value)) {
        drop.add(q.object.value);
        grew = true;
      }
  }
  return quads.filter((q) => !fromForm(q) && !(q.subject.termType === 'BlankNode' && drop.has(q.subject.value)));
}

const TEXT: Record<string, string> = {
  MinCount: 'Required',
  MaxCount: 'Too many values',
  Datatype: 'Wrong kind of value',
  NodeKind: 'Wrong kind of value (literal or IRI)',
  Class: 'Must refer to a resource of the expected type',
  Pattern: 'Does not match the expected format',
  MinLength: 'Too short',
  MaxLength: 'Too long',
  In: 'Not one of the allowed values',
  LanguageIn: 'Language not allowed',
  UniqueLang: 'Only one value per language',
};

/** Constraint components with a plain text (and an i18n key `finding.{component}`). */
export const FINDING_COMPONENTS = Object.keys(TEXT);

/**
 * A short message for a finding: the shape's sh:message, else a plain text per
 * constraint, translated by `translate` when the app passes one.
 */
export function findingText(f: ShaclFinding, translate?: (component: string) => string | undefined): string {
  const known = f.component in TEXT;
  return f.message || (known && translate?.(f.component)) || TEXT[f.component] || f.engineMessage || f.component;
}
