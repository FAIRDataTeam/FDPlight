// Redirect mode with w3id.org (SPEC §2.4, TASKS Phase 9, decided 2026-10-23).
// The IRIs live under https://w3id.org/{path}/ and w3id redirects them to the
// files on GitHub Pages (the storage base). FDPlight writes the w3id rules for
// the user to submit to perma-id/w3id.org (it never opens that pull request)
// and checks whether the redirect works.

import { iriOf, pathOf, rootOf, type Project } from './project';
import { rootFileUrl } from './served';

export const W3ID_HOST = 'w3id.org';
/** w3id's own guide for a new identifier. */
export const W3ID_GUIDE = 'https://w3id.org/docs/guides/create-an-id';

export interface W3idContact {
  name?: string;
  email?: string;
  github?: string;
}

/** The identifier path under w3id.org, e.g. `erdera/my-fdp`, or null for another host. */
export function w3idPath(base: string): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== W3ID_HOST) return null;
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  return path || null;
}

/** Where the rules go in the perma-id/w3id.org repository. */
export function w3idRulesPath(base: string): string | null {
  const path = w3idPath(base);
  return path ? `ids/${path}/.htaccess` : null;
}

/**
 * SPEC §2.4. The `.htaccess` for `ids/{path}/` in perma-id/w3id.org, following
 * w3id's conventions: a header naming the identifier and its maintainer (with
 * a GitHub username), `RewriteEngine on`, anchored patterns and temporary
 * redirects. The root IRI `{base}` goes to the root file; every other IRI
 * `{base}{path}` (records and profile documents) to `{storage}{path}.ttl`.
 * IRIs ending in `/` (LDP containers, 2.6) are not redirected.
 */
export function htaccessRules(p: Project, contact: W3idContact = {}): string {
  const path = w3idPath(p.base);
  if (!path) throw new Error('the base URI is not under https://w3id.org/');
  if (p.iriMode !== 'redirect' || !p.storageBase) throw new Error('redirect mode needs a storage base');
  const root = rootOf(p);
  const rootFile = root ? pathOf(p, root) : 'fdp.ttl';
  const who = [contact.name, contact.email].map((s) => s?.trim()).filter(Boolean) as string[];
  const lines = [
    `# # /${path}/`,
    '#',
    `# https://w3id.org/${path}/ is a FAIR Data Point whose files are served at`,
    `# ${p.storageBase}`,
    '# Rules written by FDPlight (https://fdplight.fairdatapoint.org/).',
    '#',
    '# ## Contact',
    '# This space is administered by:',
    '#',
    ...(who.length ? who.map((s) => `# ${s}`) : ['# (name and email)']),
    `# GitHub username: ${contact.github?.trim() || '(username)'}`,
    '',
    'RewriteEngine on',
    '',
    '# The FAIR Data Point itself',
    `RewriteRule ^$ ${p.storageBase}${rootFile} [R=302,L]`,
    '# Its records and profile documents: {path} is served as {path}.ttl',
    `RewriteRule ^(.*[^/])$ ${p.storageBase}$1.ttl [R=302,L]`,
  ];
  return lines.join('\n') + '\n';
}

export type RedirectStatus =
  | { state: 'ok' }
  /** w3id answers 404: the rules are not merged (or not submitted) yet. */
  | { state: 'missing' }
  /** w3id redirects, but somewhere else. */
  | { state: 'elsewhere'; url: string }
  /** No answer that a browser can read (offline, or the files are not served). */
  | { state: 'unreachable' };

export type RedirectFetch = (url: string, init: { headers: Record<string, string>; cache: 'no-store' }) => Promise<{
  ok: boolean;
  status: number;
  redirected: boolean;
  url: string;
}>;

/**
 * SPEC §2.4. Whether the root IRI redirects to the root file. w3id sends CORS
 * `*` on its redirects and its 404s, and Pages on the files it serves, so the
 * browser can follow the redirect and read where it ended (checked 2026-10-23).
 */
export async function checkRedirect(p: Project, fetchFn: RedirectFetch = fetch as unknown as RedirectFetch): Promise<RedirectStatus> {
  const root = rootOf(p);
  const expected = rootFileUrl(p);
  if (!root || !expected) return { state: 'unreachable' };
  try {
    const res = await fetchFn(iriOf(p, root), { headers: { Accept: 'text/turtle' }, cache: 'no-store' });
    if (!res.redirected) return res.status === 404 ? { state: 'missing' } : { state: 'unreachable' };
    const landed = res.url.replace(/[?#].*$/, '');
    if (landed !== expected) return { state: 'elsewhere', url: res.url };
    return res.ok ? { state: 'ok' } : { state: 'unreachable' };
  } catch {
    return { state: 'unreachable' };
  }
}
