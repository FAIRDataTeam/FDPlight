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
});
