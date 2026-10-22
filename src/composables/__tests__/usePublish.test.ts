// @vitest-environment node
// Reads the WP13.3 fixtures from disk; no DOM needed.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextTick } from 'vue';
import { expandTerm, fieldKey, shapeFields } from '@fairdatateam/record-core/record';
import { ConflictError, type FileChange, type GitHubClient } from '../../github/client';
import { DCT, NS } from '../../core/vocab';
import { useProject } from '../useProject';
import { usePublish } from '../usePublish';

/** An in-memory repository behind the GitHubClient interface. */
function fakeRepo(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let head = 'c0';
  let n = 0;
  const commits: { message: string; changes: FileChange[] }[] = [];
  const client: GitHubClient = {
    branchHead: async () => head,
    listFiles: async () => [...files.keys()],
    readFile: async (_r, p) => files.get(p) ?? null,
    commitFiles: async (_r, expected, changes, message) => {
      if (expected !== head) throw new ConflictError(expected, head);
      for (const c of changes) c.content === null ? files.delete(c.path) : files.set(c.path, c.content);
      commits.push({ message, changes });
      head = `c${++n}`;
      return head;
    },
  };
  return { client, files, commits, push: () => (head = `other${++n}`) };
}

function fill(s: ReturnType<typeof useProject>, path: string) {
  const e = s.project.entities.find((x) => s.pathOf(x) === path)!;
  const form = s.forms[e.type];
  const set = (iri: string, v: string) => {
    const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === iri)!;
    const entry = s.values[path][fieldKey(f)][0];
    if (entry.node) entry.node[Object.keys(entry.node)[0]][0].value = v;
    else entry.value = v;
  };
  set(DCT.title, 'My FDP');
  set(`${NS.dct}publisher`, 'University of Twente');
  set(`${NS.dcat}version`, '1.0');
}

async function ready(s: ReturnType<typeof useProject>) {
  await nextTick();
  await s.checkAll();
}

describe('usePublish (TASKS Phase 6)', () => {
  it('connects, proposes the Pages base, and blocks publishing while metadata is incomplete', async () => {
    const s = useProject();
    const gh = fakeRepo();
    const pub = usePublish(s, () => gh.client);
    pub.repo.value = { owner: 'ERDERA', repo: 'my-fdp', branch: 'main' };
    await pub.connect();
    expect(pub.connected.value).toBe(true);
    expect(s.project.base).toBe('https://erdera.github.io/my-fdp/');
    await ready(s);
    expect(pub.blockers.value).toEqual(['Fix the 3 metadata problems first.']);
  });

  it('publishes in one commit, stamps the entities and locks published ids', async () => {
    const s = useProject();
    const gh = fakeRepo({ 'README.md': '# my-fdp' });
    const pub = usePublish(s, () => gh.client);
    pub.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    await pub.connect();
    fill(s, 'fdp.ttl');
    await ready(s);
    expect(pub.blockers.value).toEqual([]);
    await pub.prepare();
    expect(pub.plan.value!.added).toContain('fdp.ttl');
    await pub.publish();
    expect(pub.error.value).toBe('');
    expect(gh.commits).toHaveLength(1);
    expect(gh.files.get('fdp.ttl')).toContain('dct:title "My FDP"');
    expect(gh.files.get('README.md')).toBe('# my-fdp');
    expect(s.project.entities[0].issued).toBeTruthy();
    expect(pub.commitUrl.value).toBe('https://github.com/erdera/my-fdp/commit/c1');
    expect(s.published.value.has('fdp.ttl')).toBe(true);

    // Nothing changed: the next plan is empty.
    await pub.prepare();
    expect(pub.plan.value!.changes).toEqual([]);
  });

  it('reports a conflict instead of overwriting someone else’s commit', async () => {
    const s = useProject();
    const gh = fakeRepo();
    const pub = usePublish(s, () => gh.client);
    pub.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    await pub.connect();
    fill(s, 'fdp.ttl');
    await ready(s);
    await pub.prepare();
    gh.push();
    await pub.publish();
    expect(pub.error.value).toMatch(/new commits.*reconnect/s);
    expect(gh.commits).toHaveLength(0);
  });

  it('loads the project back from the repository on connect, with nothing left to publish', async () => {
    const first = useProject();
    const gh = fakeRepo();
    const pub = usePublish(first, () => gh.client);
    pub.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    first.project.folder = 'metadata/';
    await pub.connect();
    first.add('fdp.ttl', 'catalog');
    first.rename(first.selected.value, 'rare-diseases');
    fill(first, 'fdp.ttl');
    fill(first, 'catalog/rare-diseases.ttl');
    await ready(first);
    await pub.prepare();
    await pub.publish();
    expect(gh.files.has('metadata/catalog/rare-diseases.ttl')).toBe(true);

    // A new browser session: empty editor, same repository.
    const second = useProject();
    const pub2 = usePublish(second, () => gh.client, () => true);
    pub2.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    await pub2.connect();
    expect(pub2.loaded.value).toBe(true);
    expect(pub2.loadReport.value).toEqual([]);
    expect(second.project.folder).toBe('metadata/');
    expect(second.project.entities.map((e) => second.pathOf(e))).toEqual(['fdp.ttl', 'catalog/rare-diseases.ttl']);
    expect(second.titleOf('fdp.ttl')).toBe('My FDP');
    expect(second.published.value.has('catalog/rare-diseases.ttl')).toBe(true);
    await ready(second);
    await pub2.prepare();
    expect(pub2.plan.value!.changes).toEqual([]);
  });

  it('asks before replacing local work, and keeps it when declined', async () => {
    const gh = fakeRepo();
    const a = useProject();
    const pubA = usePublish(a, () => gh.client);
    pubA.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    await pubA.connect();
    fill(a, 'fdp.ttl');
    await ready(a);
    await pubA.prepare();
    await pubA.publish();

    const b = useProject();
    b.add('fdp.ttl', 'catalog');
    let asked = 0;
    const pubB = usePublish(b, () => gh.client, () => (asked++, false));
    pubB.repo.value = { owner: 'erdera', repo: 'my-fdp', branch: 'main' };
    await pubB.connect();
    expect(asked).toBe(1);
    expect(pubB.loaded.value).toBe(false);
    expect(b.project.entities).toHaveLength(2);
  });

  it('offers to import an existing FDP and keeps its IRIs (SPEC §4.2)', async () => {
    const dir = fileURLToPath(new URL('../../core/__tests__/fixtures/wp13.3-proqolid/', import.meta.url));
    const files = Object.fromEntries(
      readdirSync(dir).filter((f) => f.endsWith('.ttl')).map((f) => [`sites/proqolid/${f}`, readFileSync(dir + f, 'utf8')]),
    );
    const gh = fakeRepo(files);
    const s = useProject();
    const pub = usePublish(s, () => gh.client, () => true);
    pub.repo.value = { owner: 'ERDERA', repo: 'WP13.3_document_based_fdp', branch: 'master' };
    await pub.connect();
    expect(pub.canImport.value).toBe(true);
    expect(pub.importCandidates.value).toContain('sites/proqolid/eprovide_fdp.ttl');
    await pub.importExisting('sites/proqolid/eprovide_fdp.ttl', 'keep');
    expect(pub.error.value).toBe('');
    expect(pub.loaded.value).toBe(true);
    expect(s.project.base).toBe('https://erdera.github.io/WP13.3_document_based_fdp/sites/proqolid/');
    expect(s.titleOf('eprovide_fdp.ttl')).toBe('ePROVIDE FAIR Data Point');
    expect([...s.published.value].sort()).toEqual(['eprovide_catalog.ttl', 'eprovide_dataset.ttl', 'eprovide_distribution.ttl', 'eprovide_fdp.ttl']);
    await pub.prepare();
    expect(pub.plan.value!.updated.sort()).toEqual([
      'sites/proqolid/eprovide_catalog.ttl',
      'sites/proqolid/eprovide_dataset.ttl',
      'sites/proqolid/eprovide_distribution.ttl',
      'sites/proqolid/eprovide_fdp.ttl',
    ]);
    expect(pub.plan.value!.added).toContain('sites/proqolid/fdplight.json');
    expect(pub.plan.value!.removed).toEqual([]);
  });
});
