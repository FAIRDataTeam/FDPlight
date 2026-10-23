// The profile (entity types, their shapes and child relations) and the
// project settings file `fdplight.json`. SPEC §3.

import { validateIriSettings, type IriMode } from './iri';
import { validateIndex, type IndexSettings } from './ping';
import { say } from './messages';

/** A child relation of a type, from the RI resource definition (SPEC §3). */
export interface ChildSpec {
  /** Key of the child type. */
  type: string;
  /** Relation IRI, e.g. dcat:dataset. */
  relation: string;
  /** List title, used as the container's dct:title. */
  title: string;
}

/** One entity type (SPEC §3.1 `types[]`). */
export interface EntityType {
  key: string;
  name: string;
  /** "" for the root type. */
  urlPrefix: string;
  targetClasses: string[];
  /** Path of the merged SHACL in the repository, or a URL. */
  shapes: string;
  children: ChildSpec[];
  /**
   * SPEC §5.2. Triples the profile writes on every entity of this type unless
   * the user gave a value for the predicate, e.g. ERDERA's
   * `ejp:vpConnection ejp:VPDiscoverable`.
   */
  defaults?: TypeDefault[];
}

/** A default triple `E predicate object` (object is an IRI). */
export interface TypeDefault {
  predicate: string;
  object: string;
}

/** A FAIR metric as configured in the RI settings (SPEC §5.2). */
export interface MetricSpec {
  /** The metric IRI. Its md5 names the metric node. */
  metric: string;
  /** The resource the metric points at (sio:SIO_000628 / sio:SIO_000332). */
  resource: string;
}

export interface Defaults {
  language: string | null;
  license: string | null;
  /** Description of the default access-rights statement. null uses the RI default. */
  accessRightsDescription: string | null;
  metrics: MetricSpec[];
}

/** Where a profile was imported from, so it can be refreshed. */
export interface ProfileSource {
  fdp: string;
  importedAt: string;
}

/** The contents of `fdplight.json` (SPEC §3.1). */
export interface ProjectFile {
  fdplight: string;
  name: string;
  base: string;
  iriMode: IriMode;
  storageBase: string | null;
  defaults: Defaults;
  types: EntityType[];
  source?: ProfileSource;
  /** Repository folder holding the FDP, '' (root) or ending with '/' (SPEC §4). */
  folder?: string;
  /** The Index to ping after each Pages deployment (SPEC §7.2). */
  index?: IndexSettings;
  /** Root file path when it is not `fdp.ttl` (an FDP imported with its IRIs, SPEC §4.2). */
  root?: string;
  /**
   * SPEC §3.1. Keys of the non-root types the project uses; absent means all.
   * Unused types are not offered and get no containers.
   */
  use?: string[];
}

/** SPEC §3.1. Whether the project uses a type (the root always). */
export function typeInUse(p: Pick<ProjectFile, 'use' | 'types'>, key: string): boolean {
  return !p.use || p.use.includes(key) || rootType(p.types).key === key;
}

/** SPEC §4. Problems with a repository folder, empty when valid. */
export function validateFolder(folder: string): string[] {
  if (folder === '') return [];
  if (!/^([a-z0-9][a-z0-9._-]*\/)+$/i.test(folder)) return [say('folderForm')];
  if (folder.split('/').some((s) => s === '..' || s === '.')) return [say('folderDots')];
  if (folder.startsWith('.github/')) return [say('folderGithub')];
  return [];
}

export const FORMAT_VERSION = '0.1';

/** RI default (`metadataProperties.accessRightsDescription`). */
export const DEFAULT_ACCESS_RIGHTS = 'This resource has no access restriction';

export const EMPTY_DEFAULTS: Defaults = {
  language: null,
  license: null,
  accessRightsDescription: DEFAULT_ACCESS_RIGHTS,
  metrics: [],
};

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** SPEC §3.1. The root type (urlPrefix ""), assuming a validated profile. */
export function rootType(types: EntityType[]): EntityType {
  const root = types.find((t) => t.urlPrefix === '');
  if (!root) throw new Error('profile has no root type');
  return root;
}

export function typeByKey(types: EntityType[], key: string): EntityType {
  const t = types.find((x) => x.key === key);
  if (!t) throw new Error(`unknown type "${key}"`);
  return t;
}

/** SPEC §5.3. The RI treats the type with urlPrefix "catalog" as the catalog (`isCatalog()`). */
export function isCatalog(t: EntityType): boolean {
  return t.urlPrefix === 'catalog';
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isAbsIri = (v: unknown): boolean => {
  if (!isStr(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

/** SPEC §3.1. Problems with a list of types, empty when valid. */
export function validateTypes(types: unknown): string[] {
  if (!Array.isArray(types) || types.length === 0) return ['types must be a non-empty array'];
  const errors: string[] = [];
  const keys = new Set<string>();
  const prefixes = new Set<string>();
  types.forEach((t: Partial<EntityType>, i) => {
    const at = `types[${i}]`;
    if (!isStr(t.key) || !/^[A-Za-z0-9_-]+$/.test(t.key)) errors.push(`${at}.key must be a simple name`);
    else if (keys.has(t.key)) errors.push(`${at}.key "${t.key}" is duplicated`);
    else keys.add(t.key);
    if (!isStr(t.name) || !t.name) errors.push(`${at}.name is required`);
    if (!isStr(t.urlPrefix) || !/^([a-z0-9][a-z0-9-]*)?$/.test(t.urlPrefix))
      errors.push(`${at}.urlPrefix must be "" or a lowercase path segment`);
    else if (prefixes.has(t.urlPrefix)) errors.push(`${at}.urlPrefix "${t.urlPrefix}" is duplicated`);
    else prefixes.add(t.urlPrefix);
    if (t.urlPrefix === 'profile') errors.push(`${at}.urlPrefix "profile" is reserved for profile IRIs`);
    if (!Array.isArray(t.targetClasses) || t.targetClasses.length === 0 || !t.targetClasses.every(isAbsIri))
      errors.push(`${at}.targetClasses must be a non-empty list of IRIs`);
    if (!isStr(t.shapes) || !t.shapes) errors.push(`${at}.shapes is required`);
    if (!Array.isArray(t.children)) errors.push(`${at}.children must be an array`);
    if (t.defaults !== undefined && (!Array.isArray(t.defaults) || !t.defaults.every((d) => d && isAbsIri(d.predicate) && isAbsIri(d.object))))
      errors.push(`${at}.defaults must be a list of {predicate, object} IRIs`);
  });
  const roots = types.filter((t: Partial<EntityType>) => t.urlPrefix === '');
  if (roots.length !== 1) errors.push(`exactly one type must have urlPrefix "" (found ${roots.length})`);
  types.forEach((t: Partial<EntityType>, i) => {
    if (!Array.isArray(t.children)) return;
    t.children.forEach((c: Partial<ChildSpec>, j) => {
      const at = `types[${i}].children[${j}]`;
      if (!isStr(c.type) || !keys.has(c.type)) errors.push(`${at}.type "${String(c.type)}" is not a known type`);
      else if (types.some((x: Partial<EntityType>) => x.key === c.type && x.urlPrefix === ''))
        errors.push(`${at}.type cannot be the root type`);
      if (!isAbsIri(c.relation)) errors.push(`${at}.relation must be an IRI`);
      if (!isStr(c.title)) errors.push(`${at}.title is required`);
    });
  });
  return errors;
}

/** SPEC §3.1. Parse and validate `fdplight.json`. */
export function parseProjectFile(input: string | unknown): Result<ProjectFile> {
  let raw: unknown = input;
  if (isStr(input)) {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`not valid JSON: ${(e as Error).message}`] };
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['must be a JSON object'] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!isStr(o.fdplight)) errors.push('fdplight (format version) is required');
  else if (o.fdplight.split('.')[0] !== FORMAT_VERSION.split('.')[0])
    errors.push(`unsupported format version ${o.fdplight}`);
  if (!isStr(o.name)) errors.push('name is required');
  if (!isStr(o.base)) errors.push('base is required');
  const iriMode = o.iriMode ?? 'file';
  const storageBase = o.storageBase ?? null;
  if (isStr(o.base))
    errors.push(...validateIriSettings({ base: o.base, iriMode: iriMode as IriMode, storageBase: storageBase as string | null }));

  const d = (o.defaults ?? {}) as Record<string, unknown>;
  const defaults: Defaults = {
    language: (d.language as string | null) ?? null,
    license: (d.license as string | null) ?? null,
    accessRightsDescription: (d.accessRightsDescription as string | null) ?? DEFAULT_ACCESS_RIGHTS,
    metrics: (d.metrics as MetricSpec[]) ?? [],
  };
  if (defaults.language !== null && !isAbsIri(defaults.language)) errors.push('defaults.language must be an IRI or null');
  if (defaults.license !== null && !isAbsIri(defaults.license)) errors.push('defaults.license must be an IRI or null');
  if (!isStr(defaults.accessRightsDescription)) errors.push('defaults.accessRightsDescription must be a string or null');
  if (!Array.isArray(defaults.metrics) || !defaults.metrics.every((m) => m && isAbsIri(m.metric) && isAbsIri(m.resource)))
    errors.push('defaults.metrics must be a list of {metric, resource} IRIs');

  errors.push(...validateTypes(o.types));
  const folder = o.folder ?? '';
  if (typeof folder !== 'string') errors.push('folder must be a string');
  else errors.push(...validateFolder(folder));
  const index = o.index as IndexSettings | undefined;
  if (index !== undefined && (typeof index !== 'object' || !index || !isStr(index.url) || !isStr(index.pagesWorkflow)))
    errors.push('index must be {url, pagesWorkflow}');
  else if (index) errors.push(...validateIndex(index));
  const use = o.use;
  if (use !== undefined) {
    const keys = Array.isArray(o.types) ? new Set((o.types as Partial<EntityType>[]).map((t) => t.key)) : new Set();
    if (!Array.isArray(use) || !use.every((k) => isStr(k) && keys.has(k))) errors.push('use must be a list of type keys');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fdplight: o.fdplight as string,
      name: o.name as string,
      base: o.base as string,
      iriMode: iriMode as IriMode,
      storageBase: storageBase as string | null,
      defaults,
      types: o.types as EntityType[],
      ...(o.source ? { source: o.source as ProfileSource } : {}),
      ...(folder ? { folder: folder as string } : {}),
      ...(index ? { index } : {}),
      ...(isStr(o.root) && o.root !== 'fdp.ttl' ? { root: o.root } : {}),
      ...(Array.isArray(use) ? { use: use as string[] } : {}),
    },
  };
}

/** Serialise `fdplight.json` with stable key order and a trailing newline. */
export function stringifyProjectFile(p: ProjectFile): string {
  const out: ProjectFile = {
    fdplight: p.fdplight,
    name: p.name,
    base: p.base,
    iriMode: p.iriMode,
    storageBase: p.storageBase,
    defaults: p.defaults,
    types: p.types,
    ...(p.source ? { source: p.source } : {}),
    ...(p.folder ? { folder: p.folder } : {}),
    ...(p.index ? { index: p.index } : {}),
    ...(p.root && p.root !== 'fdp.ttl' ? { root: p.root } : {}),
    ...(p.use ? { use: p.use } : {}),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

// ---------- Import from a running FDP (SPEC §3) ----------

/** The parts of an RI resource definition FDPlight reads (`GET /resource-definitions`). */
interface RiResourceDefinition {
  uuid: string;
  name: string;
  urlPrefix: string;
  targetClassUris: string[];
  children: { resourceDefinitionUuid: string; relationUri: string; listView?: { title?: string } }[];
}

export interface ImportedProfile {
  types: EntityType[];
  /** Merged SHACL (Turtle) per type key, to store at `types[].shapes`. */
  shapes: Record<string, string>;
  source: ProfileSource;
}

/** SPEC §3.1. The key of an imported type: "fdp" for the root, otherwise its URL prefix. */
function typeKey(rd: RiResourceDefinition): string {
  return rd.urlPrefix === '' ? 'fdp' : rd.urlPrefix;
}

/**
 * SPEC §3. Convert RI resource definitions into profile types. Types are
 * ordered root first, then breadth-first along the child relations, then
 * any unreachable ones in input order.
 */
export function typesFromResourceDefinitions(rds: RiResourceDefinition[]): EntityType[] {
  const byUuid = new Map(rds.map((rd) => [rd.uuid, rd]));
  const toType = (rd: RiResourceDefinition): EntityType => ({
    key: typeKey(rd),
    name: rd.name,
    urlPrefix: rd.urlPrefix,
    targetClasses: [...rd.targetClassUris],
    shapes: `shapes/${typeKey(rd)}.ttl`,
    children: rd.children.map((c) => {
      const child = byUuid.get(c.resourceDefinitionUuid);
      if (!child) throw new Error(`resource definition ${rd.name} has an unknown child ${c.resourceDefinitionUuid}`);
      return { type: typeKey(child), relation: c.relationUri, title: c.listView?.title ?? child.name };
    }),
  });
  const ordered: RiResourceDefinition[] = [];
  const queue = rds.filter((rd) => rd.urlPrefix === '');
  while (queue.length) {
    const rd = queue.shift()!;
    if (ordered.includes(rd)) continue;
    ordered.push(rd);
    for (const c of rd.children) {
      const child = byUuid.get(c.resourceDefinitionUuid);
      if (child) queue.push(child);
    }
  }
  for (const rd of rds) if (!ordered.includes(rd)) ordered.push(rd);
  return ordered.map(toType);
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * SPEC §3. Import a profile from a running FDP with `GET /resource-definitions`
 * and `GET /{urlPrefix}/spec` (`GET /spec` for the root). Both are public.
 */
export async function importProfileFromFdp(
  fdpUrl: string,
  fetchFn: FetchLike = fetch,
  now: () => Date = () => new Date(),
): Promise<ImportedProfile> {
  const root = fdpUrl.replace(/\/+$/, '');
  const get = async (path: string, accept: string): Promise<string> => {
    const res = await fetchFn(`${root}${path}`, { headers: { Accept: accept } });
    if (!res.ok) throw new Error(say('profileHttp', { url: `${root}${path}`, status: res.status }));
    return res.text();
  };
  const rds = JSON.parse(await get('/resource-definitions', 'application/json')) as RiResourceDefinition[];
  const types = typesFromResourceDefinitions(rds);
  const errors = validateTypes(types);
  if (errors.length) throw new Error(say('profileUnusable', { errors: errors.join('; ') }));
  const shapes: Record<string, string> = {};
  for (const t of types) shapes[t.key] = await get(t.urlPrefix === '' ? '/spec' : `/${t.urlPrefix}/spec`, 'text/turtle');
  return { types, shapes, source: { fdp: root, importedAt: now().toISOString() } };
}
