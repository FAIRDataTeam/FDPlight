// Copy an FDP by its URL only (SPEC §4.3, decided 2026-10-23).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { checkProject } from '../checks';
import { entityForm } from '../forms';
import { importFromUrl, type TurtleFetch } from '../importUrl';
import { pathOf, type Project } from '../project';
import { planPublish } from '../publish';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

const forms = Object.fromEntries(FDP_DEFAULT.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
const target = (): Project => ({ ...defaultProject(FILE_MODE), entities: [] });

function serve(pages: Record<string, string>): { fetchFn: TurtleFetch; asked: string[] } {
  const asked: string[] = [];
  const fetchFn: TurtleFetch = async (url) => {
    asked.push(url);
    const body = pages[url];
    if (body === '500') return { ok: false, status: 500, text: async () => '' };
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, url, text: async () => body ?? '' };
  };
  return { fetchFn, asked };
}

async function publish(loaded: Awaited<ReturnType<typeof importFromUrl>>) {
  if (!loaded.ok) throw new Error(loaded.error);
  const l = loaded.loaded;
  const plan = await planPublish({ project: l.project, forms, values: l.values, extras: l.extras, shapes: FDP_DEFAULT.shapes, remote: new Map(), remoteFiles: [], now: new Date('2026-10-23T10:00:00Z') });
  const file = (p: string) => plan.changes.find((c) => c.path === p)?.content ?? '';
  return { l, plan, file };
}

describe('import by URL: a file-only FDP on GitHub Pages (WP13.3)', () => {
  const OLD = 'https://erdera.github.io/WP13.3_document_based_fdp/sites/proqolid/';
  const dir = fileURLToPath(new URL('./fixtures/wp13.3-proqolid/', import.meta.url));
  const pages = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.ttl')).map((f) => [OLD + f, readFileSync(dir + f, 'utf8')]));

  it('crawls the tree, copies it under the project base, and links every record to its old IRI', async () => {
    const { fetchFn } = serve(pages);
    const { l, file } = await publish(await importFromUrl({ rootUrl: `${OLD}eprovide_fdp.ttl`, settings: target(), forms, fetchFn }));
    expect(l.project.entities.map((e) => pathOf(l.project, e))).toEqual([
      'fdp.ttl',
      'catalog/eprovide-catalog.ttl',
      'dataset/eprovide-dataset.ttl',
      'distribution/eprovide-distribution.ttl',
    ]);
    const root = file('fdp.ttl');
    expect(root).toContain(`<${FILE_MODE.base}fdp.ttl> a`);
    expect(root).toContain(`prov:wasDerivedFrom <${OLD}eprovide_fdp.ttl>`);
    expect(root).toContain('ejp:VPDiscoverable'); // kept
    expect(root).toContain('"ePROVIDE FAIR Data Point"');
    expect(file('dataset/eprovide-dataset.ttl')).toContain(`dct:isPartOf <${FILE_MODE.base}catalog/eprovide-catalog.ttl>`);
    // No old IRIs left except the prov:wasDerivedFrom links.
    for (const p of ['fdp.ttl', 'catalog/eprovide-catalog.ttl', 'dataset/eprovide-dataset.ttl', 'distribution/eprovide-distribution.ttl'])
      expect(file(p).split('\n').filter((line) => line.includes(OLD) && !line.includes('wasDerivedFrom'))).toEqual([]);
    const graphs = new Map(l.project.entities.map((e) => [pathOf(l.project, e), new Store(new Parser().parse(file(pathOf(l.project, e))))]));
    expect(checkProject(l.project, graphs).filter((i) => i.severity === 'error')).toEqual([]);
    expect(l.report[0]).toMatch(/^Copied 4 record\(s\) from .*eprovide_fdp\.ttl\. They get new IRIs under https:\/\/example\.github\.io\/my-fdp\//);
  });

  it('refuses a root that cannot be read, and says why', async () => {
    const r = await importFromUrl({ rootUrl: `${OLD}nope.ttl`, settings: target(), forms, fetchFn: serve(pages).fetchFn });
    expect(r).toEqual({ ok: false, error: `${OLD}nope.ttl answered HTTP 404` });
    const cors = await importFromUrl({ rootUrl: 'https://x.test/', settings: target(), forms, fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
    expect(cors.ok === false && cors.error).toMatch(/could not be read \(Failed to fetch\); the server may not allow browser access \(CORS\)/);
  });
});

describe('import by URL: a reference-implementation FDP', () => {
  const R = 'https://fdp.test';
  const C1 = `${R}/catalog/0f6a2c1e-1111-4a5e-9c1d-aaaaaaaaaaaa`;
  const C2 = `${R}/catalog/0f6a2c1e-2222-4a5e-9c1d-bbbbbbbbbbbb`;
  const D1 = `${R}/dataset/7d0b4e2a-3333-4c11-8d22-cccccccccccc`;
  const prefixes = '@prefix dct: <http://purl.org/dc/terms/> . @prefix dcat: <http://www.w3.org/ns/dcat#> . @prefix ldp: <http://www.w3.org/ns/ldp#> . @prefix fdp: <https://w3id.org/fdp/fdp-o#> . @prefix sio: <http://semanticscience.org/resource/> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n';
  const pages: Record<string, string> = {
    [R]: `${prefixes}<${R}> a fdp:MetadataService, fdp:FAIRDataPoint ; dct:title "Hospital FDP"@en ; fdp:metadataCatalog <${C1}>, <${C2}> ;
      dct:conformsTo <${R}/profile/77aa> ; dcat:endpointDescription <${R}/swagger-ui.html> ; sio:SIO_000628 <${R}/metrics/445c> .
      <${R}/metrics/445c> sio:SIO_000628 <https://www.ietf.org/rfc/rfc3986.txt> .
      <${R}/profile/77aa> rdfs:label "FAIR Data Point Profile" .
      <${R}/catalog/> a ldp:DirectContainer ; ldp:membershipResource <${R}> ; ldp:hasMemberRelation fdp:metadataCatalog ; ldp:contains <${C1}>, <${C2}> .
      <${R}/service/> a ldp:DirectContainer ; ldp:membershipResource <${R}> ; ldp:hasMemberRelation <https://example.org/hasService> ; ldp:contains <${R}/service/s1> .`,
    [C1]: `${prefixes}<${C1}> a dcat:Catalog ; dct:title "Registries"@en ; dct:isPartOf <${R}> ; dcat:dataset <${D1}> ;
      sio:SIO_000628 <${C1}/metrics/445c> . <${C1}/metrics/445c> sio:SIO_000332 <https://www.ietf.org/rfc/rfc3986.txt> .`,
    [C2]: '500',
    [D1]: `${prefixes}<${D1}> a dcat:Dataset ; dct:title "Registry 2024"@en ; dct:isPartOf <${C1}> .`,
  };

  it('copies what it can read, leaves out the server’s own triples, and reports the rest', async () => {
    const { fetchFn, asked } = serve(pages);
    const { l, file } = await publish(await importFromUrl({ rootUrl: R, settings: target(), forms, fetchFn }));
    expect(l.project.entities.map((e) => pathOf(l.project, e))).toEqual([
      'fdp.ttl',
      'catalog/0f6a2c1e-1111-4a5e-9c1d-aaaaaaaaaaaa.ttl',
      'dataset/7d0b4e2a-3333-4c11-8d22-cccccccccccc.ttl',
    ]);
    expect(asked).not.toContain(`${R}/service/s1`);
    expect(l.report).toContain(`${C2}: HTTP 500; left out`);
    expect(l.report).toContain(`${R}: 1 record(s) linked by https://example.org/hasService are not in this profile; left out`);
    expect(l.report.some((r) => /triple\(s\) the source server generated about itself/.test(r))).toBe(true);
    const root = file('fdp.ttl');
    for (const gone of ['swagger-ui', '/profile/77aa', `${R}/metrics/`]) expect(root).not.toContain(gone);
    expect(file('catalog/0f6a2c1e-1111-4a5e-9c1d-aaaaaaaaaaaa.ttl')).not.toContain(`${C1}/metrics/`);
    expect(root).toContain(`<${R}>`); // only as prov:wasDerivedFrom
  });
});
