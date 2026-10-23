// IRI rules of a file-only FDP: base URI, IRI mode, entity / container /
// hash IRIs, id minting and re-basing. Every function maps to SPEC §2.

import { say } from './messages';

export type IriMode = 'file' | 'redirect';

/** The IRI-related settings of a project (SPEC §3.1 `base`, `iriMode`, `storageBase`). */
export interface IriSettings {
  base: string;
  iriMode: IriMode;
  /** Where the `.ttl` files are served. Required in redirect mode, null in file mode. */
  storageBase: string | null;
}

/** Hosts whose IRIs redirect elsewhere, so the files live under a storage base (SPEC §2.2). */
export const KNOWN_REDIRECTORS = ['w3id.org', 'purl.org', 'purl.archive.org'];

/**
 * SPEC §2.1. Problems with a base URI (or a storage base), empty when valid:
 * absolute `https`, ends with `/`, no query, fragment or credentials.
 */
export function validateBase(uri: string): string[] {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return [say('notAbsoluteUri')];
  }
  const errors: string[] = [];
  if (url.protocol !== 'https:') errors.push(say('mustHttps'));
  if (!uri.endsWith('/')) errors.push(say('mustSlash'));
  if (url.search || uri.includes('?')) errors.push(say('noQuery'));
  if (url.hash || uri.includes('#')) errors.push(say('noFragment'));
  if (url.username || url.password) errors.push(say('noCredentials'));
  if (url.href !== uri) errors.push(say('notNormal', { expected: url.href }));
  return errors;
}

/** SPEC §2.2, §3.1. Problems with a project's IRI settings, empty when valid. */
export function validateIriSettings(s: IriSettings): string[] {
  const errors = validateBase(s.base).map((problem) => say('baseUri', { problem }));
  if (s.iriMode === 'redirect') {
    if (!s.storageBase) errors.push(say('storageBaseNeeded'));
    else errors.push(...validateBase(s.storageBase).map((problem) => say('storageBase', { problem })));
  } else if (s.iriMode === 'file') {
    if (s.storageBase) errors.push(say('storageBaseInFileMode'));
  } else {
    errors.push(say('unknownMode', { mode: String(s.iriMode) }));
  }
  return errors;
}

/**
 * SPEC §2.2. The IRI mode a base URI implies. `pagesCname` is the custom
 * domain of the target repository's Pages site (GitHub API `cname`), if any.
 * Returns 'ask' when FDPlight cannot tell and must ask the user once.
 */
export function detectIriMode(base: string, pagesCname?: string | null): IriMode | 'ask' {
  const host = new URL(base).hostname.toLowerCase();
  if (host.endsWith('.github.io')) return 'file';
  if (pagesCname && host === pagesCname.trim().toLowerCase().replace(/\.$/, '')) return 'file';
  if (KNOWN_REDIRECTORS.some((r) => host === r || host.endsWith(`.${r}`))) return 'redirect';
  return 'ask';
}

/** The Pages URL a repository is served from by default (SPEC §2.1). */
export function pagesBase(owner: string, repo: string): string {
  const o = owner.toLowerCase();
  // A repository named {owner}.github.io is served at the domain root.
  return repo.toLowerCase() === `${o}.github.io` ? `https://${o}.github.io/` : `https://${o}.github.io/${repo}/`;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** SPEC §2.3. A fresh random id, 8 lowercase base32 characters. */
export function mintId(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(8));
  return Array.from(bytes, (b) => BASE32[b & 31]).join('');
}

/** SPEC §2.3. Whether a user supplied id (slug) is acceptable. */
export function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

/** SPEC §2.3, §4. Repository path of an entity's file. The root type has urlPrefix "". */
export function filePath(urlPrefix: string, id: string): string {
  return urlPrefix === '' ? 'fdp.ttl' : `${urlPrefix}/${id}.ttl`;
}

/** SPEC §2.3. The IRI of an entity. */
export function entityIri(s: IriSettings, urlPrefix: string, id: string): string {
  if (s.iriMode === 'file') return s.base + filePath(urlPrefix, id);
  return urlPrefix === '' ? s.base : `${s.base}${urlPrefix}/${id}`;
}

/** SPEC §2.3. The URL the entity's file is served at. Equals the IRI in file mode. */
export function storageUrl(s: IriSettings, urlPrefix: string, id: string): string {
  const root = s.iriMode === 'file' ? s.base : s.storageBase;
  if (!root) throw new Error('redirect mode needs a storage base');
  return root + filePath(urlPrefix, id);
}

/** SPEC §2.6. A hash IRI on an entity, e.g. `{E}#identifier`. */
export function hashIri(entity: string, name: string): string {
  return `${entity}#${name}`;
}

/**
 * SPEC §2.6. The LDP container for one child type of an entity. File mode
 * uses `{E}#{childPrefix}`, redirect mode the RI form `{E}/{childPrefix}/`
 * (the redirect-mode root already ends with `/`).
 */
export function containerIri(s: IriSettings, entity: string, childPrefix: string): string {
  if (s.iriMode === 'file') return hashIri(entity, childPrefix);
  return entity.endsWith('/') ? `${entity}${childPrefix}/` : `${entity}/${childPrefix}/`;
}

/** SPEC §5.2. The profile IRI of an entity type. */
export function profileIri(s: IriSettings, typeKey: string): string {
  return s.iriMode === 'file' ? `${s.base}profile/${typeKey}.ttl` : `${s.base}profile/${typeKey}`;
}

/**
 * SPEC §2.4. The w3id `.htaccess` rules for redirect mode, to be placed in the
 * w3id directory that corresponds to `{base}`.
 */
export function htaccess(s: IriSettings): string {
  if (s.iriMode !== 'redirect' || !s.storageBase) throw new Error('htaccess is only for redirect mode');
  return [
    `# Generated by FDPlight. Redirects ${s.base} to the files at ${s.storageBase}`,
    'RewriteEngine on',
    `RewriteRule ^$ ${s.storageBase}fdp.ttl [R=302,L]`,
    `RewriteRule ^(.+)$ ${s.storageBase}$1.ttl [R=302,L]`,
    '',
  ].join('\n');
}

/** One entity as re-basing sees it. */
export interface RebaseEntity {
  urlPrefix: string;
  id: string;
}

/**
 * SPEC §2.5. A function that rewrites IRIs from one set of IRI settings to
 * another (new base and/or new mode). It maps, in order
 *  - entity IRIs exactly,
 *  - hash IRIs on an entity (`{E}#…`, e.g. `#publisher`, `#identifier`),
 *  - any other IRI under the old base, by swapping the base.
 * IRIs outside the old base are returned unchanged. System triples
 * (containers, profiles, metrics) are regenerated on save, so they need no
 * mapping here.
 */
export function rebaser(entities: RebaseEntity[], from: IriSettings, to: IriSettings): (iri: string) => string {
  const map = new Map<string, string>();
  for (const e of entities) map.set(entityIri(from, e.urlPrefix, e.id), entityIri(to, e.urlPrefix, e.id));
  return (iri) => {
    const exact = map.get(iri);
    if (exact !== undefined) return exact;
    const hash = iri.indexOf('#');
    if (hash >= 0) {
      const target = map.get(iri.slice(0, hash));
      if (target !== undefined) return target + iri.slice(hash);
    }
    if (iri.startsWith(from.base)) return to.base + iri.slice(from.base.length);
    return iri;
  };
}
