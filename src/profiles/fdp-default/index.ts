// The bundled "FDP default" profile (SPEC §3.2): FDP → Catalog → Dataset →
// Distribution, with the resource definitions and merged shapes served by
// home.fairdatapoint.org (FDP v1.22.1) on 2026-10-22.
import type { EntityType } from '../../core/profile';
import fdp from './shapes/fdp.ttl?raw';
import catalog from './shapes/catalog.ttl?raw';
import dataset from './shapes/dataset.ttl?raw';
import distribution from './shapes/distribution.ttl?raw';
import types from './types.json';

export const FDP_DEFAULT = {
  name: 'FDP default',
  types: types as EntityType[],
  shapes: { fdp, catalog, dataset, distribution } as Record<string, string>,
};
