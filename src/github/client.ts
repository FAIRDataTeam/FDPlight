// Minimal GitHub REST client for publishing (TASKS Phase 6, SPEC §7.1).
// Browser fetch with a token; api.github.com allows CORS for authenticated
// requests. Only what FDPlight needs: read a branch and its files, write one
// commit through the Git data API, and propose it as a pull request.

export const GITHUB_API = 'https://api.github.com';

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface FileChange {
  path: string;
  /** New UTF-8 content, or null to delete the file. */
  content: string | null;
}

export type GitHubFetch = (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The branch moved since the project was loaded: never overwrite, reload instead. */
export class ConflictError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`the branch has new commits (expected ${expected.slice(0, 7)}, found ${actual.slice(0, 7)}); reload before publishing`);
  }
}

/** Base64 of a UTF-8 string, in the browser and in Node. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const enc = encodeURIComponent;
const encPath = (path: string) => path.split('/').map(enc).join('/');

export function createClient(token: string, fetchFn: GitHubFetch = fetch as unknown as GitHubFetch, api = GITHUB_API) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`${api}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) throw new GitHubError(`${method} ${path}: HTTP ${res.status}${data.message ? ` (${data.message})` : ''}`, res.status);
    return data as T;
  }

  const repoPath = (r: RepoRef) => `/repos/${enc(r.owner)}/${enc(r.repo)}`;

  /** The commit SHA the branch points to. */
  async function branchHead(r: RepoRef): Promise<string> {
    const ref = await call<{ object: { sha: string } }>('GET', `${repoPath(r)}/git/ref/heads/${encPath(r.branch)}`);
    return ref.object.sha;
  }

  /** The text of a file at a commit, or null when it does not exist. */
  async function readFile(r: RepoRef, path: string, ref: string): Promise<string | null> {
    try {
      const f = await call<{ content?: string; encoding?: string; type: string }>(
        'GET',
        `${repoPath(r)}/contents/${encPath(path)}?ref=${enc(ref)}`,
      );
      if (f.type !== 'file' || f.encoding !== 'base64' || f.content === undefined) return null;
      return base64ToUtf8(f.content);
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Paths of all files at a commit. */
  async function listFiles(r: RepoRef, commitSha: string): Promise<string[]> {
    const c = await call<{ tree: { sha: string } }>('GET', `${repoPath(r)}/git/commits/${enc(commitSha)}`);
    const t = await call<{ tree: { path: string; type: string }[]; truncated: boolean }>(
      'GET',
      `${repoPath(r)}/git/trees/${enc(c.tree.sha)}?recursive=1`,
    );
    if (t.truncated) throw new Error('the repository tree is too large to list in one request');
    return t.tree.filter((e) => e.type === 'blob').map((e) => e.path);
  }

  /**
   * SPEC §7.1. One commit with all `changes` on top of `expectedHead`. Throws
   * ConflictError, without writing anything, if the branch has moved.
   */
  async function commitFiles(r: RepoRef, expectedHead: string, changes: FileChange[], message: string): Promise<string> {
    const head = await branchHead(r);
    if (head !== expectedHead) throw new ConflictError(expectedHead, head);
    const parent = await call<{ tree: { sha: string } }>('GET', `${repoPath(r)}/git/commits/${enc(head)}`);
    const tree = [];
    for (const ch of changes) {
      if (ch.content === null) {
        tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = await call<{ sha: string }>('POST', `${repoPath(r)}/git/blobs`, {
        content: utf8ToBase64(ch.content),
        encoding: 'base64',
      });
      tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await call<{ sha: string }>('POST', `${repoPath(r)}/git/trees`, { base_tree: parent.tree.sha, tree });
    const commit = await call<{ sha: string }>('POST', `${repoPath(r)}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [head],
    });
    // force: false makes GitHub reject the update if the branch moved meanwhile.
    await call('PATCH', `${repoPath(r)}/git/refs/heads/${encPath(r.branch)}`, { sha: commit.sha, force: false });
    return commit.sha;
  }

  /** A new branch `name` at `sha`. Fails (HTTP 422) if it already exists. */
  async function createBranch(r: RepoRef, name: string, sha: string): Promise<void> {
    await call('POST', `${repoPath(r)}/git/refs`, { ref: `refs/heads/${name}`, sha });
  }

  /** SPEC §7.1 "propose changes". A pull request from `head` into `r.branch`. */
  async function openPullRequest(r: RepoRef, head: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const pr = await call<{ number: number; html_url: string }>('POST', `${repoPath(r)}/pulls`, { title, head, base: r.branch, body });
    return { number: pr.number, url: pr.html_url };
  }

  return { branchHead, readFile, listFiles, commitFiles, createBranch, openPullRequest };
}

export type GitHubClient = ReturnType<typeof createClient>;
