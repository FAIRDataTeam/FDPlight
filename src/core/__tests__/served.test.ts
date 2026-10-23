import { isServed, rootFileUrl, type FetchLike } from '../served';
import { defaultProject, FILE_MODE, REDIRECT_MODE } from './fixtures/defaultTree';

describe('served check (first publish)', () => {
  it('checks the root file at the base, or at the storage base in redirect mode', () => {
    expect(rootFileUrl(defaultProject(FILE_MODE))).toBe('https://example.github.io/my-fdp/fdp.ttl');
    expect(rootFileUrl(defaultProject(REDIRECT_MODE))).toBe('https://example.github.io/my-fdp/fdp.ttl');
    const kept = defaultProject(FILE_MODE);
    kept.entities[0] = { ...kept.entities[0], path: 'eprovide_fdp.ttl' };
    expect(rootFileUrl(kept)).toBe('https://example.github.io/my-fdp/eprovide_fdp.ttl');
  });

  it('is served on 200, not on 404 or a network error (no CORS on GitHub 404s)', async () => {
    const calls: string[] = [];
    const answer = (r: { ok: boolean } | Error): FetchLike => async (url) => {
      calls.push(url);
      if (r instanceof Error) throw r;
      return r;
    };
    expect(await isServed('https://x.github.io/f/fdp.ttl', answer({ ok: true }))).toBe(true);
    expect(await isServed('https://x.github.io/f/fdp.ttl', answer({ ok: false }))).toBe(false);
    expect(await isServed('https://x.github.io/f/fdp.ttl', answer(new TypeError('Failed to fetch')))).toBe(false);
    expect(calls[0]).toMatch(/^https:\/\/x\.github\.io\/f\/fdp\.ttl\?fdplight-check=\d+$/);
  });
});
