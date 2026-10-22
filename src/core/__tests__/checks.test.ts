import { DataFactory, Store } from 'n3';
import { checkProject, iriProblem, type Issue } from '../checks';
import { pathOf, type Project } from '../project';
import { LDP, RDF_TYPE } from '../vocab';
import { serializeEntity } from '../wiring';
import { defaultProject, FILE_MODE, userGraph } from './fixtures/defaultTree';

const { namedNode, quad } = DataFactory;
const B = FILE_MODE.base;

function build(p: Project = defaultProject(FILE_MODE)) {
  const graphs = new Map<string, Store>(
    p.entities.map((e) => [pathOf(p, e), serializeEntity(p, e, userGraph(p, pathOf(p, e)))]),
  );
  return { p, graphs };
}
const rules = (issues: Issue[]) => issues.map((i) => `${i.rule} ${i.severity} ${i.entity ?? '-'}`);
const add = (g: Store, s: string, p: string, o: string) => g.addQuad(quad(namedNode(s), namedNode(p), namedNode(o)));

describe('checkProject (SPEC §6)', () => {
  it('finds nothing in the clean tree', () => {
    const { p, graphs } = build();
    expect(checkProject(p, graphs)).toEqual([]);
  });

  it('rule 2: asks for confirmation when a file describes something outside the base', () => {
    const { p, graphs } = build();
    add(graphs.get('dataset/empty-set.ttl')!, 'https://elsewhere.org/x', 'https://example.org/p', 'https://example.org/o');
    expect(rules(checkProject(p, graphs))).toEqual(['2 confirm dataset/empty-set.ttl']);
  });

  it('rule 3: flags links to entities that have no file', () => {
    const { p, graphs } = build();
    add(graphs.get('catalog/rare-diseases.ttl')!, `${B}catalog/rare-diseases.ttl#dataset`, LDP.contains, `${B}dataset/gone.ttl`);
    add(graphs.get('catalog/rare-diseases.ttl')!, `${B}catalog/rare-diseases.ttl`, 'http://www.w3.org/ns/dcat#dataset', `${B}dataset/gone.ttl`);
    expect(rules(checkProject(p, graphs))).toEqual(['3 error catalog/rare-diseases.ttl', '3 error catalog/rare-diseases.ttl']);
  });

  it('rule 4: flags orphans, wrong parents and a second root', () => {
    const p = defaultProject(FILE_MODE);
    p.entities.push({ type: 'dataset', id: 'orphan', parent: null, issued: 'x', modified: 'x' });
    p.entities.push({ type: 'distribution', id: 'misplaced', parent: 'catalog/rare-diseases.ttl', issued: 'x', modified: 'x' });
    p.entities.push({ type: 'dataset', id: 'lost', parent: 'catalog/gone.ttl', issued: 'x', modified: 'x' });
    // No graphs given, so the root-type check (rule 7) fires too.
    expect(rules(checkProject(p, new Map()))).toEqual([
      '4 error dataset/orphan.ttl',
      '4 error distribution/misplaced.ttl',
      '4 error dataset/lost.ttl',
      '7 error fdp.ttl',
    ]);
  });

  it('rule 5: flags duplicate entity IRIs and containers declared in two files', () => {
    const p = defaultProject(FILE_MODE);
    p.entities.push({ ...p.entities[3] });
    const { graphs } = build(defaultProject(FILE_MODE));
    add(graphs.get('dataset/empty-set.ttl')!, `${B}catalog/rare-diseases.ttl#dataset`, RDF_TYPE, LDP.DirectContainer);
    expect(rules(checkProject(p, graphs))).toEqual(['5 error dataset/empty-set.ttl', '5 error catalog/rare-diseases.ttl']);
  });

  it('rule 6: flags malformed IRIs, such as an identifier typo with a space', () => {
    const { p, graphs } = build();
    add(graphs.get('distribution/registry-csv.ttl')!, `${B}distribution/registry-csv.ttl`, 'https://example.org/p', `${B}distribution/eprovide disribution.ttl#identifier`);
    expect(rules(checkProject(p, graphs))).toEqual(['6 error distribution/registry-csv.ttl']);
    expect(iriProblem('https://x.org/a#b#c')).toMatch(/more than one/);
    expect(iriProblem(`${B}fdp.ttl#`, B)).toMatch(/empty fragment/);
    expect(iriProblem('http://www.w3.org/ns/dcat#', B)).toBeNull();
    expect(iriProblem('relative/iri')).toMatch(/absolute/);
  });

  it('rule 7: flags a root without fdp:MetadataService or r3d:Repository', () => {
    const p = defaultProject(FILE_MODE);
    p.types = p.types.map((t) =>
      t.urlPrefix === '' ? { ...t, targetClasses: t.targetClasses.filter((c) => !c.endsWith('#MetadataService')) } : t,
    );
    const { graphs } = build(p);
    expect(rules(checkProject(p, graphs))).toEqual(['7 error fdp.ttl']);
  });
});
