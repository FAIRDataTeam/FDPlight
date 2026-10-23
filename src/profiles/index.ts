// The bundled profiles (SPEC §3.2).
import type { EntityType } from '../core/profile';
import { ERDERA } from './erdera';
import { FDP_DEFAULT } from './fdp-default';
import { SOFTWARE } from './software';

export interface BundledProfile {
  name: string;
  types: EntityType[];
  shapes: Record<string, string>;
  /** Types a new project uses (SPEC §3.1 `use`); absent means all. */
  use?: string[];
}

export const PROFILES: Record<string, BundledProfile> = {
  'fdp-default': FDP_DEFAULT,
  software: SOFTWARE,
  erdera: ERDERA,
};
