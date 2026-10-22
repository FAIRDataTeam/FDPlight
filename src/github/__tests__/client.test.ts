import { base64ToUtf8, ConflictError, createClient, utf8ToBase64, type GitHubFetch } from '../client';

const repo = { owner: 'FAIRDataTeam', repo: 'fdp-pilot', branch: 'main' };

function fakeGitHub(head = 'c0ffee1') {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const refs = new Map([['main', head]]);
  const fetchFn: GitHubFetch = async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    calls.push(`${init.method ?? 'GET'} ${path}`);
    if (init.body) bodies.push(JSON.parse(init.body));
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const ref = /\/git\/ref\/heads\/(.+)$/.exec(path);
    if (ref) return refs.has(ref[1]) ? ok({ object: { sha: refs.get(ref[1]) } }) : { ok: false, status: 404, json: async () => ({}) };
    if (path.endsWith('/git/refs') && init.method === 'POST') {
      const b = JSON.parse(init.body!) as { ref: string; sha: string };
      refs.set(b.ref.replace('refs/heads/', ''), b.sha);
      return ok({});
    }
    if (path.endsWith('/pulls')) return ok({ number: 7, html_url: 'https://github.com/FAIRDataTeam/fdp-pilot/pull/7' });
    if (path.includes('/git/commits/') && (init.method ?? 'GET') === 'GET') return ok({ tree: { sha: 'tree0' } });
    if (path.endsWith('/git/blobs')) return ok({ sha: `blob${calls.length}` });
    if (path.endsWith('/git/trees')) return ok({ sha: 'tree1' });
    if (path.endsWith('/git/commits')) return ok({ sha: 'new1234' });
    if (/\/git\/refs\/heads\/.+$/.test(path)) return ok({});
    if (path.includes('/contents/missing.ttl')) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    if (path.includes('/contents/fdp.ttl')) return ok({ type: 'file', encoding: 'base64', content: utf8ToBase64('<a> <b> "é" .') });
    if (path.includes('/git/trees/tree0?recursive=1')) return ok({ truncated: false, tree: [{ path: 'fdp.ttl', type: 'blob' }, { path: 'catalog', type: 'tree' }] });
    return { ok: false, status: 500, json: async () => ({ message: `unexpected ${path}` }) };
  };
  return { fetchFn, calls, bodies };
}

describe('GitHub client (SPEC §7.1)', () => {
  it('round-trips UTF-8 through base64', () => {
    expect(base64ToUtf8(utf8ToBase64('Zeldzame ziekten — é ü 漢字'))).toBe('Zeldzame ziekten — é ü 漢字');
  });

  it('reads files and lists the tree', async () => {
    const gh = fakeGitHub();
    const c = createClient('t0ken', gh.fetchFn);
    expect(await c.readFile(repo, 'fdp.ttl', 'main')).toBe('<a> <b> "é" .');
    expect(await c.readFile(repo, 'missing.ttl', 'main')).toBeNull();
    expect(await c.listFiles(repo, 'c0ffee1')).toEqual(['fdp.ttl']);
  });

  it('writes one commit: blobs, tree, commit, then a non-forced ref update', async () => {
    const gh = fakeGitHub();
    const sha = await createClient('t0ken', gh.fetchFn).commitFiles(
      repo,
      'c0ffee1',
      [{ path: 'fdp.ttl', content: 'x' }, { path: 'catalog/old.ttl', content: null }],
      'FDPlight: publish',
    );
    expect(sha).toBe('new1234');
    expect(gh.calls.map((c) => c.split(' ')[0] + ' ' + c.split('/').slice(-2).join('/'))).toEqual([
      'GET heads/main',
      'GET commits/c0ffee1',
      'POST git/blobs',
      'POST git/trees',
      'POST git/commits',
      'PATCH heads/main',
    ]);
    const tree = gh.bodies[1] as { base_tree: string; tree: { path: string; sha: string | null }[] };
    expect(tree.base_tree).toBe('tree0');
    expect(tree.tree.map((e) => [e.path, e.sha === null])).toEqual([['fdp.ttl', false], ['catalog/old.ttl', true]]);
    expect(gh.bodies[3]).toEqual({ sha: 'new1234', force: false });
  });

  it('refuses to write when the branch has moved', async () => {
    const gh = fakeGitHub('beef999');
    await expect(createClient('t0ken', gh.fetchFn).commitFiles(repo, 'c0ffee1', [{ path: 'a', content: 'b' }], 'm')).rejects.toBeInstanceOf(ConflictError);
    expect(gh.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  });

  it('sends the token and the API version', async () => {
    let headers: Record<string, string> = {};
    const fetchFn: GitHubFetch = async (_u, init) => {
      headers = init.headers;
      return { ok: true, status: 200, json: async () => ({ object: { sha: 'x' } }) };
    };
    await createClient('t0ken', fetchFn).branchHead(repo);
    expect(headers.Authorization).toBe('Bearer t0ken');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('proposes changes: branch at the head, the commit on it, then a pull request', async () => {
    const gh = fakeGitHub();
    const c = createClient('t0ken', gh.fetchFn);
    const branch = { ...repo, branch: 'fdplight/20261022-120000' };
    await c.createBranch(repo, branch.branch, 'c0ffee1');
    await c.commitFiles(branch, 'c0ffee1', [{ path: 'fdp.ttl', content: 'x' }], 'FDPlight: publish');
    const pr = await c.openPullRequest(repo, branch.branch, 'FDPlight: publish', 'body');
    expect(pr).toEqual({ number: 7, url: 'https://github.com/FAIRDataTeam/fdp-pilot/pull/7' });
    expect(gh.calls.filter((x) => !x.startsWith('GET'))).toEqual([
      'POST /repos/FAIRDataTeam/fdp-pilot/git/refs',
      'POST /repos/FAIRDataTeam/fdp-pilot/git/blobs',
      'POST /repos/FAIRDataTeam/fdp-pilot/git/trees',
      'POST /repos/FAIRDataTeam/fdp-pilot/git/commits',
      'PATCH /repos/FAIRDataTeam/fdp-pilot/git/refs/heads/fdplight/20261022-120000',
      'POST /repos/FAIRDataTeam/fdp-pilot/pulls',
    ]);
    expect(gh.bodies[0]).toEqual({ ref: 'refs/heads/fdplight/20261022-120000', sha: 'c0ffee1' });
    expect(gh.bodies.at(-1)).toEqual({ title: 'FDPlight: publish', head: 'fdplight/20261022-120000', base: 'main', body: 'body' });
  });
});
