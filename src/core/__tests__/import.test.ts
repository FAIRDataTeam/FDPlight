import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { checkProject } from '../checks';
import { entityForm } from '../forms';
import { importExistingFdp, iriRewriter } from '../import';
import { loadProject } from '../load';
import { parseProjectFile } from '../profile';
import { pathOf } from '../project';
import { planPublish } from '../publish';

const dir = fileURLToPath(new URL('./fixtures/wp13.3-proqolid/', import.meta.url));
const FILES = new Map(
  readdirSync(dir)
    .filter((f) => f.endsWith('.ttl'))
    .map((f) => [`sites/proqolid/${f}`, readFileSync(dir + f, 'utf8')]),
);
FILES.set('README.md', '# WP13.3');
const forms = Object.fromEntries(FDP_DEFAULT.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
const BASE = 'https://erdera.github.io/WP13.3_document_based_fdp/sites/proqolid/';
const T = new Date('2026-10-23T09:00:00.000Z');

function doImport(mode: 'keep' | 'migrate') {
  const r = importExistingFdp({ rootPath: 'sites/proqolid/eprovide_fdp.ttl', files: FILES, types: FDP_DEFAULT.types, forms, mode });
  if (!r.ok) throw new Error(r.error);
  return r.loaded;
}

async function publishLoaded(loaded: ReturnType<typeof doImport>, remote = new Map<string, string | null>(FILES)) {
  return planPublish({
    project: loaded.project,
    forms,
    values: loaded.values,
    extras: loaded.extras,
    shapes: FDP_DEFAULT.shapes,
    remote,
    remoteFiles: [...remote.keys()],
    now: T,
  });
}

const content = (plan: Awaited<ReturnType<typeof publishLoaded>>, path: string) => plan.changes.find((c) => c.path === path)?.content ?? '';

describe('import the WP13.3 proqolid FDP (TASKS Phase 4 test case)', () => {
  it('keep: finds the tree with the existing IRIs', () => {
    const loaded = doImport('keep');
    expect(loaded.project.base).toBe(BASE);
    expect(loaded.project.folder).toBe('sites/proqolid/');
    expect(loaded.project.root).toBe('eprovide_fdp.ttl');
    expect(loaded.project.entities.map((e) => [e.type, pathOf(loaded.project, e), e.parent])).toEqual([
      ['fdp', 'eprovide_fdp.ttl', null],
      ['catalog', 'eprovide_catalog.ttl', 'eprovide_fdp.ttl'],
      ['dataset', 'eprovide_dataset.ttl', 'eprovide_catalog.ttl'],
      ['distribution', 'eprovide_distribution.ttl', 'eprovide_dataset.ttl'],
    ]);
    expect(loaded.project.entities[0].issued).toBe('2025-11-04T00:00:00Z');
  });

  it('reports the wiring problems and what became of every triple', () => {
    const loaded = doImport('keep');
    expect(loaded.report).toContain(
      'eprovide_distribution.ttl: identifier node eprovide_disribution.ttl#identifier is not the one fdp:metadataIdentifier points to (eprovide_distribution.ttl#identifier); replaced by eprovide_distribution.ttl#identifier',
    );
    expect(loaded.report).toContain(
      'container catalog/datasets/ is declared in eprovide_catalog.ttl, eprovide_dataset.ttl for different parents; each file gets its own container on save',
    );
    expect(Object.keys(loaded.counts)).toEqual(['eprovide_fdp.ttl', 'eprovide_catalog.ttl', 'eprovide_dataset.ttl', 'eprovide_distribution.ttl']);
    for (const c of Object.values(loaded.counts)) {
      expect(c.mapped + c.regenerated + c.kept).toBe(c.total);
      expect(Math.min(c.mapped, c.regenerated, c.kept)).toBeGreaterThan(0);
    }
    expect(loaded.counts['eprovide_dataset.ttl']).toEqual({ total: 37, mapped: 15, regenerated: 15, kept: 7 });
    // Migrating keys the counts by the new paths.
    expect(Object.keys(doImport('migrate').counts)).toContain('distribution/eprovide-distribution.ttl');
  });

  it('reads files without metadata timestamps', () => {
    const files = new Map([...FILES].map(([p, t]) => [p, t.replace(/^.*fdp:metadata(Issued|Modified).*$/gm, '')]));
    const r = importExistingFdp({ rootPath: 'sites/proqolid/eprovide_fdp.ttl', files, types: FDP_DEFAULT.types, forms, mode: 'keep' });
    expect(r.ok && r.loaded.project.entities.map((e) => e.issued)).toEqual([undefined, undefined, undefined, undefined]);
    expect(r.ok && Object.keys(r.loaded.counts)).toHaveLength(4);
  });

  it('keep: one save fixes the wiring and keeps the metadata', async () => {
    const loaded = doImport('keep');
    const plan = await publishLoaded(loaded);
    const catalog = content(plan, 'sites/proqolid/eprovide_catalog.ttl');
    const dataset = content(plan, 'sites/proqolid/eprovide_dataset.ttl');
    const distribution = content(plan, 'sites/proqolid/eprovide_distribution.ttl');
    const root = content(plan, 'sites/proqolid/eprovide_fdp.ttl');
    // The shared container is gone: one container per parent.
    for (const ttl of [catalog, dataset]) expect(ttl).not.toContain('catalog/datasets/');
    expect(catalog).toContain(`<${BASE}eprovide_catalog.ttl#dataset> a ldp:DirectContainer`);
    expect(dataset).toContain(`<${BASE}eprovide_dataset.ttl#distribution> a ldp:DirectContainer`);
    // The identifier typo is gone, the right identifier is there.
    expect(distribution).not.toContain('disribution');
    expect(distribution).toContain(`<${BASE}eprovide_distribution.ttl#identifier> a datacite:Identifier`);
    // Parents are linked; the hand-made BasicContainer is gone.
    expect(dataset).toContain(`dct:isPartOf <${BASE}eprovide_catalog.ttl>`);
    expect(catalog).not.toContain('BasicContainer');
    // Metadata FDPlight does not model is kept verbatim.
    expect(root).toContain('ejp:VPDiscoverable');
    expect(root).toContain('fdp:conformsToFdpSpec');
    expect(root).toContain('"MAPi Research Trust"');
    expect(root).toContain('"ePROVIDE FAIR Data Point"');
    // Whole-project checks pass (SPEC §6 rules 2 to 7).
    const graphs = new Map(
      loaded.project.entities.map((e) => {
        const p = pathOf(loaded.project, e);
        return [p, new Store(new Parser().parse(content(plan, `sites/proqolid/${p}`)))];
      }),
    );
    expect(checkProject(loaded.project, graphs).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('keep: no user metadata is lost', async () => {
    const loaded = doImport('keep');
    const plan = await publishLoaded(loaded);
    for (const [path, ttl] of FILES) {
      if (!path.endsWith('.ttl')) continue;
      const out = new Store(new Parser().parse(content(plan, path)));
      const E = BASE + path.slice('sites/proqolid/'.length);
      // Every literal the original file states about E is still stated.
      for (const q of new Parser().parse(ttl))
        if (q.subject.value === E && q.object.termType === 'Literal' && !/metadata(Issued|Modified)$|\/(issued|modified)$/.test(q.predicate.value))
          expect(out.has(q), `${path} ${q.predicate.value} ${q.object.value}`).toBe(true);
    }
  });

  it('keep: reopening the saved project round-trips exactly', async () => {
    const loaded = doImport('keep');
    const first = await publishLoaded(loaded);
    const after = new Map<string, string | null>(FILES);
    for (const c of first.changes) after.set(c.path, c.content);
    const settings = parseProjectFile(after.get('sites/proqolid/fdplight.json')!);
    if (!settings.ok) throw new Error(settings.errors.join());
    expect(settings.value.root).toBe('eprovide_fdp.ttl');
    const rel = new Map([...after].filter(([p]) => p.startsWith('sites/proqolid/')).map(([p, t]) => [p.slice(15), t!]));
    const reloaded = loadProject(settings.value, rel, forms);
    const again = await planPublish({
      project: { ...reloaded.project, entities: reloaded.project.entities.map((e, i) => ({ ...e, ...first.entities[i], parent: e.parent })) },
      forms,
      values: reloaded.values,
      extras: reloaded.extras,
      shapes: FDP_DEFAULT.shapes,
      remote: after,
      remoteFiles: [...after.keys()],
      now: new Date('2026-12-01T00:00:00Z'),
    });
    expect(again.changes).toEqual([]);
  });

  it('migrate: moves to FDPlight paths and rewrites the old IRIs', async () => {
    const loaded = doImport('migrate');
    expect(loaded.project.entities.map((e) => pathOf(loaded.project, e))).toEqual([
      'fdp.ttl',
      'catalog/eprovide-catalog.ttl',
      'dataset/eprovide-dataset.ttl',
      'distribution/eprovide-distribution.ttl',
    ]);
    expect(loaded.report.at(-1)).toMatch(/^Migrated to new IRIs\. The old files stay .*eprovide_fdp\.ttl/);
    const plan = await publishLoaded(loaded);
    expect(plan.removed).toEqual([]); // old files are not FDPlight's to delete
    for (const p of ['fdp.ttl', 'catalog/eprovide-catalog.ttl', 'dataset/eprovide-dataset.ttl', 'distribution/eprovide-distribution.ttl']) {
      const ttl = content(plan, `sites/proqolid/${p}`);
      expect(ttl, p).not.toMatch(/proqolid\/eprovide_/);
    }
    expect(content(plan, 'sites/proqolid/fdp.ttl')).toContain('ejp:VPDiscoverable');
  });

  it('refuses a root file that is not an FDP', () => {
    const r = importExistingFdp({ rootPath: 'sites/proqolid/eprovide_catalog.ttl', files: FILES, types: FDP_DEFAULT.types, forms, mode: 'keep' });
    expect(r).toEqual({ ok: false, error: 'sites/proqolid/eprovide_catalog.ttl has no FAIR Data Point whose IRI ends with /eprovide_catalog.ttl' });
  });

  it('iriRewriter moves other IRIs under the old base, but not twice into a longer new base (SPEC §2.5)', () => {
    const rw = iriRewriter(new Map([['https://a.org/x/fdp.ttl', 'https://a.org/x/m/fdp.ttl']]), { from: 'https://a.org/x/', to: 'https://a.org/x/m/' });
    expect(rw.iri('https://a.org/x/fdp.ttl#publisher')).toBe('https://a.org/x/m/fdp.ttl#publisher');
    expect(rw.iri('https://a.org/x/profile/catalog.ttl')).toBe('https://a.org/x/m/profile/catalog.ttl');
    expect(rw.iri('https://a.org/x/m/profile/catalog.ttl')).toBe('https://a.org/x/m/profile/catalog.ttl');
    expect(rw.iri('https://other.org/x/')).toBe('https://other.org/x/');
  });
});
