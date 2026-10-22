// The form of an entity type: the profile's merged shapes, minus the paths
// FDPlight generates (TASKS Phase 2, SPEC §5.7).

import { formSchema } from '@fairdatateam/record-core/forms';
import { expandTerm, recordToQuads, type RecordNode } from '@fairdatateam/record-core/record';
import { parseShacl } from '@fairdatateam/record-core/shacl';
import type { Schema } from '@fairdatateam/record-core/types';
import { Store } from 'n3';
import type { EntityType } from './profile';
import { generatedPaths } from './wiring';

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
    .map((g) => ({ ...g, fields: g.fields.filter((f) => f.inversePath || !hidden.has(expandTerm(f.path, form.prefixes) ?? '')) }))
    .filter((g) => g.fields.length);
  return { ...form, groups };
}

/** SPEC §5.1. The user graph of an entity from its form values. */
export function userGraphFromForm(form: Schema, entityIri: string, values: RecordNode): Store {
  return new Store(recordToQuads(form, entityIri, values));
}
