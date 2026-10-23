import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { profileFromFiles, type LocalFile } from '../profileFiles';
import type { FetchLike } from '../profile';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../profiles/software/${path}`, import.meta.url)), 'utf8');
const types = JSON.parse(read('types.json'));
const shapesFiles = (): LocalFile[] =>
  ['fdp', 'catalog', 'software', 'source-code'].map((k) => ({ name: `${k}.ttl`, text: read(`shapes/${k}.ttl`) }));
const json = (o: unknown, name = 'fdplight.json'): LocalFile => ({ name, text: JSON.stringify(o) });
const noFetch: FetchLike = () => Promise.reject(new Error('no network in tests'));

describe('profileFromFiles (SPEC §3.3)', () => {
  it('reads the types from a project file and the shapes from the Turtle files they name', async () => {
    const r = await profileFromFiles([json({ fdplight: '0.1', name: 'Software', base: 'https://x.github.io/y/', types, use: ['catalog', 'software'] }), ...shapesFiles()], noFetch);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.name).toBe('Software');
    expect(r.value.types.map((t) => t.key)).toEqual(['fdp', 'catalog', 'software', 'source-code']);
    expect(r.value.types.map((t) => t.shapes)).toEqual(['shapes/fdp.ttl', 'shapes/catalog.ttl', 'shapes/software.ttl', 'shapes/source-code.ttl']);
    expect(r.value.shapes.software).toBe(read('shapes/software.ttl'));
    expect(r.value.use).toEqual(['catalog', 'software']);
  });

  it('accepts a bare {types} file named after nothing in particular', async () => {
    const r = await profileFromFiles([json({ types }, 'my-profile.json'), ...shapesFiles()], noFetch);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.name).toBe('my-profile.json');
    expect(r.value.use).toBeUndefined();
  });

  it('lists every missing or broken file', async () => {
    const files = shapesFiles().filter((f) => f.name !== 'software.ttl');
    files[0] = { name: 'fdp.ttl', text: '<a> <b> .' + ' oops' };
    const r = await profileFromFiles([json({ types }), ...files], noFetch);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/^fdp\.ttl is not valid Turtle/);
    expect(r.errors[1]).toBe('Software: choose its shapes file software.ttl too');
  });

  it('needs exactly one JSON file with valid types', async () => {
    expect(await profileFromFiles(shapesFiles(), noFetch)).toEqual({ ok: false, errors: ['choose exactly one .json file with the types (found 0)'] });
    expect(await profileFromFiles([json({ types: [] }), ...shapesFiles()], noFetch)).toEqual({ ok: false, errors: ['fdplight.json: types must be a non-empty array'] });
    const bad = await profileFromFiles([{ name: 'p.json', text: '{' }], noFetch);
    expect(bad.ok || bad.errors[0]).toMatch(/^p\.json is not valid JSON/);
  });

  it('fetches shapes given as URLs when no local file has their name', async () => {
    const remote = types.map((t: { key: string }) => ({ ...t, shapes: `https://example.org/shapes/${t.key}.ttl` }));
    const asked: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      asked.push(url);
      const key = url.split('/').pop()!.replace('.ttl', '');
      return { ok: true, status: 200, text: async () => read(`shapes/${key}.ttl`) };
    };
    const r = await profileFromFiles([json({ types: remote })], fetchFn);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(asked).toHaveLength(4);
    expect(r.value.types[2].shapes).toBe('shapes/software.ttl');
  });
});
