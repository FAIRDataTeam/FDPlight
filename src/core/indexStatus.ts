// What an FDP Index knows about the project (TASKS Phase 7), from its public
// endpoints: GET /index/entries/all and GET /index/entries/{uuid}/data.
// home.fairdatapoint.org allows these from the browser (CORS `*`).

import { parseRdf } from '@fairdatateam/record-core/rdf';
import { FDP } from './vocab';

export interface IndexEntry {
  uuid: string;
  clientUrl: string;
  /** ACTIVE, INACTIVE, UNREACHABLE, INVALID, UNKNOWN … */
  state: string;
  registrationTime: string;
  modificationTime: string;
}

export interface IndexStatus {
  entry: IndexEntry | null;
  /** Entity IRIs the Index harvested (subjects with fdp:metadataIdentifier). */
  harvested: string[];
  /** Project entity IRIs the Index does not have. */
  missing: string[];
  /** The harvested data of the entry (public Turtle endpoint). */
  dataUrl: string | null;
}

export type IndexFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const norm = (u: string) => u.replace(/\/+$/, '');

/**
 * The Index's view of the FDP whose root is `rootIri`. `entityIris` are the
 * project's entities, to tell which ones were harvested.
 */
export async function fetchIndexStatus(
  indexUrl: string,
  rootIri: string,
  entityIris: string[],
  fetchFn: IndexFetch = fetch as unknown as IndexFetch,
): Promise<IndexStatus> {
  const base = norm(indexUrl);
  const get = async (path: string, accept: string) => {
    const res = await fetchFn(`${base}${path}`, { headers: { Accept: accept } });
    if (!res.ok) throw new Error(`GET ${base}${path} failed with HTTP ${res.status}`);
    return res.text();
  };
  const entries = JSON.parse(await get('/index/entries/all', 'application/json')) as IndexEntry[];
  const entry = entries.find((e) => norm(e.clientUrl) === norm(rootIri)) ?? null;
  if (!entry) return { entry: null, harvested: [], missing: entityIris, dataUrl: null };

  const data = parseRdf(await get(`/index/entries/${encodeURIComponent(entry.uuid)}/data`, 'text/turtle'), 'turtle');
  if (data.error) throw new Error(`the Index returned unreadable data: ${data.error}`);
  const harvested = [...new Set(data.quads.filter((q) => q.predicate.value === FDP.metadataIdentifier).map((q) => q.subject.value))];
  const have = new Set(harvested.map(norm));
  return {
    entry,
    harvested,
    missing: entityIris.filter((i) => !have.has(norm(i))),
    dataUrl: `${base}/index/entries/${encodeURIComponent(entry.uuid)}/data`,
  };
}
