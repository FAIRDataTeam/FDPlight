// Is the project on the web yet? (TASKS Phase 6 first-publish helper,
// decided 2026-10-23.) FDPlight publishes to the repository; GitHub Pages
// serves the files. A first publish to a repository without Pages lands, but
// nothing is served and the Index is never pinged, so FDPlight checks.

import { pathOf, rootOf, type Project } from './project';

export type FetchLike = (url: string, init: { headers: Record<string, string>; cache: 'no-store' }) => Promise<{ ok: boolean }>;

/** Where the root file is served (the storage base in redirect mode). */
export function rootFileUrl(p: Project): string | null {
  const root = rootOf(p);
  const base = p.iriMode === 'file' ? p.base : p.storageBase;
  return root && base ? base + pathOf(p, root) : null;
}

/**
 * True when the root file is served. Pages answers with CORS `*` for files
 * it serves; a site without Pages gives a 404 without CORS, which the browser
 * reports as a network error, so "not served" and "offline" look the same.
 */
export async function isServed(url: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<boolean> {
  try {
    // A query string sidesteps a cached 404 from before Pages was switched on.
    const res = await fetchFn(`${url}?fdplight-check=${Date.now()}`, { headers: { Accept: 'text/turtle' }, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
