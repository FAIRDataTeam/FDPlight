// The bundled "Software" profile: FDP → Catalog → Software → Software source
// code. The root and catalog are those of the FDP default profile; software
// and source code use schema.org (CodeMeta) classes, also typed dcat:Resource
// so the generic Resource fields (title, publisher, licence, …) apply.
// Catalog → Software uses dcat:resource (DCAT 3), Software → source code
// schema:hasPart.
import type { EntityType } from '../../core/profile';
import fdp from './shapes/fdp.ttl?raw';
import catalog from './shapes/catalog.ttl?raw';
import software from './shapes/software.ttl?raw';
import sourceCode from './shapes/source-code.ttl?raw';
import types from './types.json';

export const SOFTWARE = {
  name: 'Software',
  types: types as EntityType[],
  shapes: { fdp, catalog, software, 'source-code': sourceCode } as Record<string, string>,
};
