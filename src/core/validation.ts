// Per-entity SHACL check before publish (SPEC §6 rule 1): the full graph
// FDPlight would write for the entity, against the shapes of its type, with
// the shared record-core engine (shacl-engine, SHACL Core).

import type { RecordNode } from '@fairdatateam/record-core/record';
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
  const extra = graph.getQuads(null, null, null, null) as unknown as Quad[];
  // The same values the file was built from, so both describe the same nodes.
  const r = await checkRecordShacl(form, iri, withHashNodes(form, iri, values), extra, shapes);
  return r.findings;
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
