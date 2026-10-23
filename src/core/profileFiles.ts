// A profile opened from local files (SPEC §3.3, TASKS Phase 1): one JSON
// file with the types, as in `fdplight.json`, and the Turtle files its
// `shapes` entries name. A `shapes` entry may also be a URL, which is fetched.

import { Parser } from 'n3';
import { validateTypes, type EntityType, type FetchLike, type Result } from './profile';

export interface LocalFile {
  name: string;
  text: string;
}

export interface FileProfile {
  /** The JSON's `name`, else its file name. */
  name: string;
  /** The types, each with `shapes` set to `shapes/{key}.ttl` (the project's own copy). */
  types: EntityType[];
  /** Turtle per type key. */
  shapes: Record<string, string>;
  /** The JSON's `use`, if any (SPEC §3.1). */
  use?: string[];
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** SPEC §3.3. Read a profile from local files; every problem is listed. */
export async function profileFromFiles(files: LocalFile[], fetchFn: FetchLike = fetch): Promise<Result<FileProfile>> {
  const json = files.filter((f) => f.name.toLowerCase().endsWith('.json'));
  if (json.length !== 1) return { ok: false, errors: [`choose exactly one .json file with the types (found ${json.length})`] };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json[0].text);
  } catch (e) {
    return { ok: false, errors: [`${json[0].name} is not valid JSON: ${(e as Error).message}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: [`${json[0].name} must be a JSON object`] };
  const typeErrors = validateTypes(raw.types);
  if (typeErrors.length) return { ok: false, errors: typeErrors.map((e) => `${json[0].name}: ${e}`) };
  const types = raw.types as EntityType[];

  const errors: string[] = [];
  const keys = new Set(types.map((t) => t.key));
  const use = raw.use;
  if (use !== undefined && (!Array.isArray(use) || !use.every((k) => typeof k === 'string' && keys.has(k))))
    errors.push(`${json[0].name}: use must be a list of type keys`);

  const turtle = new Map(files.filter((f) => !f.name.toLowerCase().endsWith('.json')).map((f) => [baseName(f.name), f]));
  const shapes: Record<string, string> = {};
  for (const t of types) {
    const local = turtle.get(baseName(t.shapes));
    let text: string;
    let from: string;
    if (local) {
      text = local.text;
      from = local.name;
    } else if (isUrl(t.shapes)) {
      try {
        const res = await fetchFn(t.shapes, { headers: { Accept: 'text/turtle' } });
        if (!res.ok) {
          errors.push(`${t.name}: ${t.shapes} answered HTTP ${res.status}`);
          continue;
        }
        text = await res.text();
        from = t.shapes;
      } catch (e) {
        errors.push(`${t.name}: ${t.shapes} could not be read (${(e as Error).message})`);
        continue;
      }
    } else {
      errors.push(`${t.name}: choose its shapes file ${baseName(t.shapes)} too`);
      continue;
    }
    try {
      new Parser().parse(text);
    } catch (e) {
      errors.push(`${from} is not valid Turtle: ${(e as Error).message}`);
      continue;
    }
    shapes[t.key] = text;
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name: typeof raw.name === 'string' && raw.name ? raw.name : json[0].name,
      types: types.map((t) => ({ ...t, shapes: `shapes/${t.key}.ttl` })),
      shapes,
      ...(Array.isArray(use) ? { use: (use as string[]).filter((k) => types.some((t) => t.key === k && t.urlPrefix !== '')) } : {}),
    },
  };
}
