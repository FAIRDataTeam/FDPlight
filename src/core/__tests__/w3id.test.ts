import { checkRedirect, htaccessRules, w3idPath, w3idRulesPath, type RedirectFetch } from '../w3id';
import { FILE_MODE, REDIRECT_MODE, defaultProject } from './fixtures/defaultTree';

const project = () => defaultProject(REDIRECT_MODE);
const STORAGE = 'https://example.github.io/my-fdp/';

describe('w3id redirect mode (SPEC §2.4)', () => {
  it('finds the identifier path and where its rules go', () => {
    expect(w3idPath('https://w3id.org/example/my-fdp/')).toBe('example/my-fdp');
    expect(w3idRulesPath('https://w3id.org/example/my-fdp/')).toBe('ids/example/my-fdp/.htaccess');
    expect(w3idPath('https://W3ID.org/x/')).toBe('x');
    expect(w3idPath('https://w3id.org/')).toBeNull();
    expect(w3idPath('https://purl.org/x/')).toBeNull();
    expect(w3idPath('not a url')).toBeNull();
  });

  it('writes rules in w3id style: contact header, root, then every other non-container IRI', () => {
    const rules = htaccessRules(project(), { name: 'Jane Doe', email: 'jane@example.org', github: 'janedoe' });
    expect(rules).toBe(
      [
        '# # /example/my-fdp/',
        '#',
        '# https://w3id.org/example/my-fdp/ is a FAIR Data Point whose files are served at',
        `# ${STORAGE}`,
        '# Rules written by FDPlight (https://fdplight.fairdatapoint.org/).',
        '#',
        '# ## Contact',
        '# This space is administered by:',
        '#',
        '# Jane Doe',
        '# jane@example.org',
        '# GitHub username: janedoe',
        '',
        'RewriteEngine on',
        '',
        '# The FAIR Data Point itself',
        `RewriteRule ^$ ${STORAGE}fdp.ttl [R=302,L]`,
        '# Its records and profile documents: {path} is served as {path}.ttl',
        `RewriteRule ^(.*[^/])$ ${STORAGE}$1.ttl [R=302,L]`,
        '',
      ].join('\n'),
    );
    // No spaces in flag lists, no trailing whitespace (w3id rules).
    expect(rules).not.toMatch(/\[[^\]]* [^\]]*\]|[ \t]$/m);
  });

  it('marks missing contact details as placeholders, and refuses other modes', () => {
    expect(htaccessRules(project())).toContain('# (name and email)\n# GitHub username: (username)\n');
    expect(() => htaccessRules(defaultProject(FILE_MODE))).toThrow(/w3id/);
    expect(() => htaccessRules({ ...project(), storageBase: '' })).toThrow(/storage base/);
  });

  it('applies like Apache would: each IRI lands on its file', () => {
    // The two RewriteRule patterns, matched against the path relative to the directory.
    const rules = htaccessRules(project())
      .split('\n')
      .filter((l) => l.startsWith('RewriteRule'))
      .map((l) => {
        const [, pattern, target] = l.split(' ');
        return { re: new RegExp(pattern), target };
      });
    const resolve = (iri: string) => {
      const rel = iri.slice('https://w3id.org/example/my-fdp/'.length);
      for (const r of rules) {
        const m = rel.match(r.re);
        if (m) return r.target.replace('$1', m[1] ?? '');
      }
      return null;
    };
    expect(resolve('https://w3id.org/example/my-fdp/')).toBe(`${STORAGE}fdp.ttl`);
    expect(resolve('https://w3id.org/example/my-fdp/catalog/abc')).toBe(`${STORAGE}catalog/abc.ttl`);
    expect(resolve('https://w3id.org/example/my-fdp/profile/catalog')).toBe(`${STORAGE}profile/catalog.ttl`);
    expect(resolve('https://w3id.org/example/my-fdp/catalog/abc/dataset/')).toBeNull();
  });

  it('tells a working redirect from missing rules, a wrong target and no answer', async () => {
    const answer = (r: Partial<Awaited<ReturnType<RedirectFetch>>>): RedirectFetch => async () => ({ ok: true, status: 200, redirected: false, url: '', ...r });
    const p = project();
    expect(await checkRedirect(p, answer({ redirected: true, url: `${STORAGE}fdp.ttl` }))).toEqual({ state: 'ok' });
    expect(await checkRedirect(p, answer({ ok: false, status: 404, url: 'https://w3id.org/example/my-fdp/' }))).toEqual({ state: 'missing' });
    expect(await checkRedirect(p, answer({ redirected: true, url: 'https://old.example.org/fdp' }))).toEqual({ state: 'elsewhere', url: 'https://old.example.org/fdp' });
    expect(await checkRedirect(p, () => Promise.reject(new TypeError('Failed to fetch')))).toEqual({ state: 'unreachable' });
    const asked: string[] = [];
    await checkRedirect(p, async (url) => (asked.push(url), { ok: true, status: 200, redirected: true, url: `${STORAGE}fdp.ttl` }));
    expect(asked).toEqual(['https://w3id.org/example/my-fdp/']);
  });
});
