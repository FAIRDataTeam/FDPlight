// Minimal typings for shacl-engine (the package ships none) — just what
// shaclCheck.ts uses. Results are typed at the call site.
declare module 'shacl-engine' {
  import type { DatasetCore } from '@rdfjs/types';

  export class Validator {
    constructor(shapes: DatasetCore, options: { factory: unknown; details?: boolean; debug?: boolean });
    validate(data: { dataset: DatasetCore; terms?: Iterable<unknown> }): Promise<{ conforms: boolean; results: unknown[] }>;
  }
}
