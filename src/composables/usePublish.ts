// Connecting a project to a GitHub repository and publishing it in one
// commit (TASKS Phase 6, SPEC §7.1).

import { computed, ref, shallowRef } from 'vue';
import { ConflictError, createClient, GitHubError, type GitHubClient, type RepoRef } from '../github/client';
import { DEFAULT_BASE, type ProjectState } from './useProject';
import { pagesBase } from '../core/iri';
import { PING_WORKFLOW_PATH } from '../core/ping';
import { planPublish, type PublishPlan } from '../core/publish';

const TOKEN_KEY = 'fdplight.github.token';

function loadToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the token lives for this page only */
  }
}

export function usePublish(state: ProjectState, makeClient: (token: string) => GitHubClient = (t) => createClient(t)) {
  const repo = ref<RepoRef>({ owner: '', repo: '', branch: 'main' });
  const token = ref(loadToken());
  const connected = ref(false);
  const busy = ref(false);
  const error = ref('');
  const head = ref('');
  const remote = shallowRef(new Map<string, string | null>());
  const remoteFiles = shallowRef<string[]>([]);
  const plan = shallowRef<PublishPlan | null>(null);
  const lastCommit = ref('');

  let client: GitHubClient | null = null;

  const blockers = computed(() => {
    const out: string[] = [];
    if (state.settingsErrors.value.length) out.push('Fix the project settings first.');
    if (state.issues.value.some((i) => i.severity === 'error')) out.push('Fix the structural problems first.');
    if (state.totalErrors.value) out.push(`Fix the ${state.totalErrors.value} metadata problems first.`);
    if (state.checking.value) out.push('Checking the metadata…');
    return out;
  });

  const commitUrl = computed(() =>
    lastCommit.value ? `https://github.com/${repo.value.owner}/${repo.value.repo}/commit/${lastCommit.value}` : '',
  );

  function fail(e: unknown): void {
    if (e instanceof GitHubError && e.status === 401) error.value = 'GitHub rejected the token (401).';
    else if (e instanceof GitHubError && e.status === 404)
      error.value = 'Repository or branch not found, or the token cannot access it (404).';
    else error.value = e instanceof Error ? e.message : String(e);
  }

  /** The paths FDPlight would read back: its own files only (SPEC §4). */
  function ownedPaths(files: string[]): string[] {
    const folder = state.project.folder ?? '';
    const prefixes = state.project.types.map((t) => t.urlPrefix).filter(Boolean);
    return files.filter((p) => {
      if (p === PING_WORKFLOW_PATH) return true;
      if (!p.startsWith(folder)) return false;
      const rel = p.slice(folder.length);
      return (
        rel === 'fdp.ttl' ||
        rel === 'fdplight.json' ||
        rel.startsWith('shapes/') ||
        prefixes.some((x) => new RegExp(`^${x}/[^/]+\\.ttl$`).test(rel))
      );
    });
  }

  async function refresh(): Promise<void> {
    if (!client) return;
    head.value = await client.branchHead(repo.value);
    remoteFiles.value = await client.listFiles(repo.value, head.value);
    const contents = new Map<string, string | null>();
    for (const p of ownedPaths(remoteFiles.value)) contents.set(p, await client.readFile(repo.value, p, head.value));
    remote.value = contents;
    // SPEC §2.3: ids of entities that are in the repository are locked.
    const folder = state.project.folder ?? '';
    state.published.value = new Set(state.project.entities.map((e) => state.pathOf(e)).filter((p) => contents.has(folder + p)));
  }

  async function connect(): Promise<void> {
    error.value = '';
    busy.value = true;
    plan.value = null;
    try {
      saveToken(token.value);
      client = makeClient(token.value);
      await refresh();
      connected.value = true;
      if (state.project.base === DEFAULT_BASE) state.setBase(pagesBase(repo.value.owner, repo.value.repo));
    } catch (e) {
      connected.value = false;
      fail(e);
    } finally {
      busy.value = false;
    }
  }

  /** Build the plan for review. */
  async function prepare(): Promise<void> {
    error.value = '';
    plan.value = await planPublish({
      project: state.project,
      forms: state.forms,
      values: state.values,
      shapes: state.shapes,
      remote: remote.value,
      remoteFiles: remoteFiles.value,
      now: new Date(),
    });
  }

  async function publish(): Promise<void> {
    if (!client || !plan.value || blockers.value.length) return;
    busy.value = true;
    error.value = '';
    try {
      if (plan.value.changes.length) lastCommit.value = await client.commitFiles(repo.value, head.value, plan.value.changes, plan.value.message);
      state.project.entities = plan.value.entities;
      plan.value = null;
      await refresh();
    } catch (e) {
      if (e instanceof ConflictError) error.value = `${e.message}. Someone else published meanwhile; reconnect to load their changes.`;
      else fail(e);
    } finally {
      busy.value = false;
    }
  }

  function disconnect(): void {
    client = null;
    connected.value = false;
    plan.value = null;
    token.value = '';
    saveToken('');
  }

  return { repo, token, connected, busy, error, head, remoteFiles, plan, blockers, lastCommit, commitUrl, connect, prepare, publish, disconnect };
}
