// Connecting a project to a GitHub repository and publishing it in one
// commit (TASKS Phase 6, SPEC §7.1).

import { computed, ref, shallowRef } from 'vue';
import { ConflictError, createClient, GitHubError, type GitHubClient, type RepoRef } from '../github/client';
import { DEFAULT_BASE, type ProjectState } from './useProject';
import { useI18n } from './useI18n';
import { pagesBase } from '../core/iri';
import { importExistingFdp, type ImportMode } from '../core/import';
import { loadProject, type LoadedProject } from '../core/load';
import { parseProjectFile } from '../core/profile';
import { entityForm } from '../core/forms';
import { PING_WORKFLOW_PATH } from '../core/ping';
import { planPublish, type PublishPlan } from '../core/publish';
import { isServed, rootFileUrl, type FetchLike } from '../core/served';
import { rootPath } from '../core/project';

const TOKEN_KEY = 'fdplight.github.token';
const { t, plural } = useI18n();

const PROPOSAL_NOTE =
  'Proposed with [FDPlight](https://fdplight.fairdatapoint.org/). Merging publishes these files; GitHub Pages serves them after its next deployment.';

/** SPEC §7.1. Branch for a proposal, e.g. `fdplight/20261022-120000`. */
export function proposalBranch(now: Date): string {
  return `fdplight/${now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`;
}

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

export function usePublish(
  state: ProjectState,
  makeClient: (token: string) => GitHubClient = (t) => createClient(t),
  confirmReplace: () => boolean = () => window.confirm(t('publish.replaceConfirm')),
  fetchFn?: FetchLike,
) {
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
  /** SPEC §7.1. Commit to the branch, or propose the commit as a pull request. */
  const publishMode = ref<'commit' | 'propose'>('commit');
  const lastPull = ref<{ number: number; url: string } | null>(null);
  /** Entity paths sent in a pull request: their ids are locked too (SPEC §2.3). */
  let proposed = new Set<string>();
  /** What loading the repository's project reported (SPEC §5.7: nothing dropped silently). */
  const loadReport = ref<string[]>([]);
  /** Per entity file: triples mapped to the form, regenerated and kept (TASKS Phase 4). */
  const loadCounts = ref<LoadedProject['counts']>({});
  const loaded = ref(false);
  /** Whether the root file is on the web (GitHub Pages), decided 2026-10-23. */
  const served = ref<'unknown' | 'checking' | 'yes' | 'no'>('unknown');
  const servedUrl = computed(() => rootFileUrl(state.project) ?? '');
  /** The repository has no FDPlight project: an existing FDP can be imported. */
  const canImport = computed(
    () => connected.value && !loaded.value && !remoteFiles.value.some((p) => p === 'fdplight.json' || p.endsWith('/fdplight.json')),
  );
  /** Turtle files that could be the root of an existing FDP. */
  const importCandidates = computed(() => remoteFiles.value.filter((p) => p.endsWith('.ttl') && !p.includes('shapes/')));

  let client: GitHubClient | null = null;

  const blockers = computed(() => {
    const out: string[] = [];
    if (state.settingsErrors.value.length) out.push(t('publish.fixSettings'));
    if (state.issues.value.some((i) => i.severity === 'error')) out.push(t('publish.fixStructure'));
    if (state.totalErrors.value) out.push(plural('publish.fixMetadata', state.totalErrors.value));
    if (state.checking.value) out.push(t('publish.checkingMetadata'));
    return out;
  });

  const commitUrl = computed(() =>
    lastCommit.value ? `https://github.com/${repo.value.owner}/${repo.value.repo}/commit/${lastCommit.value}` : '',
  );

  function fail(e: unknown): void {
    if (e instanceof GitHubError && e.status === 401) error.value = t('publish.tokenRejected');
    else if (e instanceof GitHubError && e.status === 404)
      error.value = t('publish.notFound');
    else error.value = e instanceof Error ? e.message : String(e);
  }

  /** The paths FDPlight would read back: its own files only (SPEC §4). */
  function ownedPaths(files: string[]): string[] {
    const folder = state.project.folder ?? '';
    const prefixes = state.project.types.map((t) => t.urlPrefix).filter(Boolean);
    // Entities imported with their own file names (SPEC §4.2) are ours too.
    const entityFiles = new Set(state.project.entities.map((e) => folder + state.pathOf(e)));
    return files.filter((p) => {
      if (p === PING_WORKFLOW_PATH || entityFiles.has(p)) return true;
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
    state.published.value = new Set(
      state.project.entities.map((e) => state.pathOf(e)).filter((p) => contents.has(folder + p) || proposed.has(p)),
    );
  }

  /**
   * SPEC §4.1. Load the FDPlight project in the repository, if there is one:
   * its settings, its own shapes, and the tree and metadata from its files.
   */
  async function loadFromRepository(): Promise<boolean> {
    if (!client) return false;
    const candidates = remoteFiles.value.filter((p) => p === 'fdplight.json' || p.endsWith('/fdplight.json'));
    const wanted = `${state.project.folder ?? ''}fdplight.json`;
    const settingsPath = candidates.includes(wanted) ? wanted : candidates.length === 1 ? candidates[0] : null;
    if (!settingsPath) return false;
    const text = await client.readFile(repo.value, settingsPath, head.value);
    const parsed = text === null ? null : parseProjectFile(text);
    if (!parsed || !parsed.ok) {
      loadReport.value = [`${settingsPath}: ${parsed && !parsed.ok ? parsed.errors.join('; ') : 'unreadable'}`];
      return false;
    }
    if (state.hasLocalWork() && !confirmReplace()) return false;
    const settings = parsed.value;
    const folder = settings.folder ?? '';
    const shapes: Record<string, string> = {};
    for (const t of settings.types) {
      const s = await client.readFile(repo.value, folder + t.shapes, head.value);
      if (s === null) throw new Error(`${folder}${t.shapes} is missing from the repository`);
      shapes[t.key] = s;
    }
    const files = new Map<string, string>();
    for (const p of remoteFiles.value) {
      if (!p.startsWith(folder) || !p.endsWith('.ttl') || p.startsWith(`${folder}shapes/`)) continue;
      const content = await client.readFile(repo.value, p, head.value);
      if (content !== null) files.set(p.slice(folder.length), content);
    }
    const forms = Object.fromEntries(settings.types.map((t) => [t.key, entityForm(t, shapes[t.key])]));
    const result = loadProject(settings, files, forms);
    state.load(result, shapes);
    loadReport.value = result.report;
    loadCounts.value = result.counts;
    loaded.value = true;
    return true;
  }

  async function connect(): Promise<void> {
    error.value = '';
    busy.value = true;
    plan.value = null;
    loadReport.value = [];
    loadCounts.value = {};
    loaded.value = false;
    try {
      saveToken(token.value);
      client = makeClient(token.value);
      head.value = await client.branchHead(repo.value);
      remoteFiles.value = await client.listFiles(repo.value, head.value);
      await loadFromRepository();
      await refresh();
      connected.value = true;
      if (!loaded.value && state.project.base === DEFAULT_BASE) state.setBase(pagesBase(repo.value.owner, repo.value.repo) + (state.project.folder ?? ''));
      // Already published: is it on the web? (A first publish is checked after publishing.)
      served.value = 'unknown';
      if (remote.value.has((state.project.folder ?? '') + rootPath(state.project))) await checkServed();
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
      extras: state.extras.value,
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
      const { changes, message } = plan.value;
      lastPull.value = null;
      if (changes.length && publishMode.value === 'propose') {
        // A new branch at the head we read; the target branch is not written,
        // so there is no conflict to check: GitHub shows one in the PR.
        const branch = proposalBranch(new Date());
        await client.createBranch(repo.value, branch, head.value);
        lastCommit.value = await client.commitFiles({ ...repo.value, branch }, head.value, changes, message);
        const [title, ...rest] = message.split('\n');
        lastPull.value = await client.openPullRequest(repo.value, branch, title, `${rest.join('\n').trim()}\n\n${PROPOSAL_NOTE}`);
        const folder = state.project.folder ?? '';
        for (const c of changes) if (c.content !== null && c.path.startsWith(folder)) proposed.add(c.path.slice(folder.length));
      } else if (changes.length) {
        lastCommit.value = await client.commitFiles(repo.value, head.value, changes, message);
      }
      state.project.entities = plan.value.entities;
      plan.value = null;
      await refresh();
    } catch (e) {
      if (e instanceof ConflictError) error.value = t('publish.conflict', { error: e.message });
      else fail(e);
    } finally {
      busy.value = false;
    }
  }

  /** SPEC §4.2. Import the FDP whose root file is `rootPath` (no fdplight.json yet). */
  async function importExisting(rootPath: string, mode: ImportMode): Promise<void> {
    if (!client) return;
    error.value = '';
    busy.value = true;
    try {
      const folder = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/') + 1) : '';
      const files = new Map<string, string>();
      for (const p of remoteFiles.value) {
        if (!p.startsWith(folder) || !p.endsWith('.ttl')) continue;
        const text = await client.readFile(repo.value, p, head.value);
        if (text !== null) files.set(p, text);
      }
      const r = importExistingFdp({ rootPath, files, types: state.project.types, forms: state.forms, mode });
      if (!r.ok) {
        error.value = r.error;
        return;
      }
      if (state.hasLocalWork() && !confirmReplace()) return;
      state.load(r.loaded, state.shapes);
      loadReport.value = r.loaded.report;
      loadCounts.value = r.loaded.counts;
      loaded.value = true;
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      busy.value = false;
    }
  }

  async function checkServed(): Promise<void> {
    if (!servedUrl.value) return;
    served.value = 'checking';
    served.value = (await isServed(servedUrl.value, fetchFn)) ? 'yes' : 'no';
  }

  function disconnect(): void {
    client = null;
    proposed = new Set();
    lastPull.value = null;
    connected.value = false;
    plan.value = null;
    token.value = '';
    saveToken('');
  }

  return { repo, token, connected, busy, error, head, remoteFiles, plan, blockers, lastCommit, commitUrl, publishMode, lastPull, served, servedUrl, checkServed, loadReport, loadCounts, loaded, canImport, importCandidates, importExisting, connect, prepare, publish, disconnect };
}
