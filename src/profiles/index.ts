// The bundled profiles (SPEC §3.2).
import type { EntityType } from '../core/profile';
import { FDP_DEFAULT } from './fdp-default';
import { SOFTWARE } from './software';

export interface BundledProfile {
  name: string;
  types: EntityType[];
  shapes: Record<string, string>;
}

export const PROFILES: Record<string, BundledProfile> = {
  'fdp-default': FDP_DEFAULT,
  software: SOFTWARE,
};
