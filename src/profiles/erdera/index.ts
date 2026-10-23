// The bundled ERDERA profile (decided 2026-10-23): the resource definitions of
// ERDERA/FDP-Reference-Implementation-Configuration. Every schema extends
// Resource. FDP → Catalog → Dataset → Distribution → Access Service, and under
// a catalog also Patient Registries, Biobanks and Guidelines (dct:hasPart) and
// Data Services (dcat:service). The root is not a dcat:DataService (ERDERA
// removes that inheritance). Shapes: scripts/build-erdera-profile.ts.
// New projects use the FDP chain; the user ticks the other types they need.
import type { EntityType } from '../../core/profile';
import biobank from './shapes/biobank.ttl?raw';
import catalog from './shapes/catalog.ttl?raw';
import dataservice from './shapes/dataservice.ttl?raw';
import dataservice2 from './shapes/dataservice2.ttl?raw';
import dataset from './shapes/dataset.ttl?raw';
import distribution from './shapes/distribution.ttl?raw';
import fdp from './shapes/fdp.ttl?raw';
import guideline from './shapes/guideline.ttl?raw';
import patientregistry from './shapes/patientregistry.ttl?raw';
import types from './types.json';

export const ERDERA = {
  name: 'ERDERA',
  types: types as EntityType[],
  shapes: { fdp, catalog, dataset, distribution, patientregistry, biobank, guideline, dataservice, dataservice2 } as Record<string, string>,
  use: ['catalog', 'dataset', 'distribution'],
};
