// The form of an entity type: the profile's merged shapes, minus the paths
// FDPlight generates (TASKS Phase 2, SPEC §5.7).

import { formSchema } from '@fairdatateam/record-core/forms';
import { expandTerm, fieldKey, nestedShapeOf, recordHasContent, recordToQuads, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Quad } from '@fairdatateam/record-core/rdf';
import { parseShacl } from '@fairdatateam/record-core/shacl';
import type { Field, Schema } from '@fairdatateam/record-core/types';
import { DataFactory, Store } from 'n3';
import { hashIri } from './iri';
import type { EntityType } from './profile';
import { NS, RDF_TYPE } from './vocab';
import { generatedPaths } from './wiring';

/**
 * SPEC §5.6. Nested values with their own identity get a hash IRI on the
 * entity, named after the path: `E#publisher`, `E#contactPoint`, then
 * `E#publisher-2`, … Other nested values stay blank nodes.
 */
export const HASH_NODE_PATHS: Record<string, string> = {
  [`${NS.dct}publisher`]: 'publisher',
  [`${NS.dcat}contactPoint`]: 'contactPoint',
};

/**
 * A field whose sh:node is a shape of the same graph, and that is not
 * constrained to an IRI, is a sub-form. The FDP shapes mark such fields with
 * `dash:BlankNodeEditor`, which the record engine does not know, so it would
 * otherwise render them as a text field.
 */
function asSubForm(schema: Schema, f: Field): Field {
  const nested = f.node && f.nodeKind !== 'sh:IRI' && schema.nestedShapes.some((ns) => ns.iri === f.node);
  return nested && f.widgetId !== 'DetailsEditor' ? { ...f, widgetId: 'DetailsEditor' } : f;
}

/**
 * One form for an entity type: every NodeShape in `shapesTtl` that targets
 * one of the type's classes, merged (record-core `formSchema`), without the
 * fields the wiring writes itself.
 */
export function entityForm(type: EntityType, shapesTtl: string): Schema {
  const parsed = parseShacl(shapesTtl, 'turtle');
  if (!parsed.schema) throw new Error(`the shapes of ${type.name} do not parse: ${parsed.error}`);
  const form = formSchema(parsed.schema, type.targetClasses);
  const hidden = new Set(generatedPaths(type));
  const groups = form.groups
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((f) => f.inversePath || !hidden.has(expandTerm(f.path, form.prefixes) ?? ''))
        .map((f) => asSubForm(form, f)),
    }))
    .filter((g) => g.fields.length);
  const nestedShapes = form.nestedShapes.map((ns) => ({ ...ns, fields: ns.fields.map((f) => asSubForm(form, f)) }));
  return { ...form, groups, nestedShapes };
}

/**
 * SPEC §5.6. A copy of the form values in which nested publisher / contact
 * point values that have content but no IRI get their hash IRI. Applied on a
 * copy so the stored values never hold an IRI a rename would make stale.
 */
export function withHashNodes(form: Schema, entityIri: string, values: RecordNode): RecordNode {
  const node: RecordNode = { ...values };
  for (const f of shapeFields(form)) {
    const name = HASH_NODE_PATHS[expandTerm(f.path, form.prefixes) ?? ''];
    const key = fieldKey(f);
    if (!name || f.inversePath || !nestedShapeOf(form, f) || !node[key]) continue;
    node[key] = node[key].map((v, i) =>
      v.value || !recordHasContent(v.node ?? {}) ? v : { ...v, value: hashIri(entityIri, i ? `${name}-${i + 1}` : name) },
    );
  }
  return node;
}

/**
 * SPEC §5.1, §5.6. The user graph of an entity from its form values. Each
 * filled-in nested node is also typed with its shape's target class (e.g.
 * `E#publisher a foaf:Agent`), as the FDP itself does and as import expects.
 */
export function userGraphFromForm(form: Schema, entityIri: string, values: RecordNode, extras: Quad[] = []): Store {
  const store = new Store(recordToQuads(form, entityIri, withHashNodes(form, entityIri, values)));
  // SPEC §5.7: triples the form has no place for, kept from an imported file.
  store.addQuads(extras as never);
  const subject = DataFactory.namedNode(entityIri);
  for (const f of shapeFields(form)) {
    const ns = nestedShapeOf(form, f);
    const path = expandTerm(f.path, form.prefixes);
    const cls = ns?.targetClass ? expandTerm(ns.targetClass, form.prefixes) : null;
    if (!ns || !path || !cls || f.inversePath) continue;
    for (const q of store.getQuads(subject, DataFactory.namedNode(path), null, null))
      if (q.object.termType !== 'Literal' && store.getQuads(q.object, null, null, null).length)
        store.addQuad(q.object as never, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(cls));
  }
  return store;
}
