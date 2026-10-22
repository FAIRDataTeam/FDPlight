import { fetchIndexStatus, type IndexFetch } from '../indexStatus';

const ROOT = 'https://fdplight.fairdatapoint.org/metadata/fdp.ttl';
const CAT = 'https://fdplight.fairdatapoint.org/metadata/catalog/software.ttl';
const ENTRIES = [
  { uuid: 'aaa', clientUrl: 'https://other.example.org', state: 'ACTIVE', registrationTime: '', modificationTime: '' },
  { uuid: 'u-1', clientUrl: `${ROOT}/`, state: 'ACTIVE', registrationTime: '2026-10-22T15:00:00Z', modificationTime: '2026-10-22T15:01:00Z' },
];
const DATA = `<${ROOT}> <https://w3id.org/fdp/fdp-o#metadataIdentifier> <${ROOT}#identifier> .`;

function fake(entries = ENTRIES, data = DATA) {
  const urls: string[] = [];
  const fetchFn: IndexFetch = async (url) => {
    urls.push(url);
    const body = url.endsWith('/index/entries/all') ? JSON.stringify(entries) : url.endsWith('/u-1/data') ? data : null;
    return { ok: body !== null, status: body === null ? 404 : 200, text: async () => body ?? '' };
  };
  return { fetchFn, urls };
}

describe('fetchIndexStatus (TASKS Phase 7)', () => {
  it('finds the entry by root IRI and tells which entities were harvested', async () => {
    const f = fake();
    const s = await fetchIndexStatus('https://home.fairdatapoint.org/', ROOT, [ROOT, CAT], f.fetchFn);
    expect(s.entry?.state).toBe('ACTIVE');
    expect(s.harvested).toEqual([ROOT]);
    expect(s.missing).toEqual([CAT]);
    expect(s.dataUrl).toBe('https://home.fairdatapoint.org/index/entries/u-1/data');
    expect(f.urls).toEqual(['https://home.fairdatapoint.org/index/entries/all', 'https://home.fairdatapoint.org/index/entries/u-1/data']);
  });

  it('reports an FDP the Index does not know', async () => {
    const s = await fetchIndexStatus('https://home.fairdatapoint.org', 'https://nowhere.example.org/fdp.ttl', [ROOT], fake().fetchFn);
    expect(s).toEqual({ entry: null, harvested: [], missing: [ROOT], dataUrl: null });
  });

  it('fails clearly when the Index does', async () => {
    const fetchFn: IndexFetch = async () => ({ ok: false, status: 503, text: async () => '' });
    await expect(fetchIndexStatus('https://home.fairdatapoint.org', ROOT, [], fetchFn)).rejects.toThrow('HTTP 503');
  });
});
