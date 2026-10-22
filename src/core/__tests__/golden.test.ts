// Golden tests (HANDOFF §4.4): the default-profile tree in both IRI modes,
// compared with hand-written Turtle triple by triple. The graphs have no blank
// nodes, so isomorphism is set equality of N-Triples lines.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, Store, Writer, type Quad } from 'n3';
import { checkProject } from '../checks';
import { iriOf, pathOf, type Project } from '../project';
import { serializeEntity, toTurtle } from '../wiring';
import { defaultProject, FILE_MODE, REDIRECT_MODE, userGraph } from './fixtures/defaultTree';

const golden = (mode: string, path: string) =>
  readFileSync(fileURLToPath(new URL(`./golden/${mode}/${path}`, import.meta.url)), 'utf8');

const nt = (g: Store | Quad[]): string[] =>
  (Array.isArray(g) ? g : g.getQuads(null, null, null, null)).map((q) => new Writer({ format: 'N-Triples' }).quadToString(q.subject, q.predicate, q.object)).sort();

function serializeAll(project: Project): Map<string, Store> {
  return new Map(project.entities.map((e) => [pathOf(project, e), serializeEntity(project, e, userGraph(project, pathOf(project, e)))]));
}

describe.each([
  ['file', FILE_MODE],
  ['redirect', REDIRECT_MODE],
] as const)('golden tree, %s mode', (mode, settings) => {
  const project = defaultProject(settings);
  const graphs = serializeAll(project);

  it.each(project.entities.map((e) => pathOf(project, e)))('%s matches the expected graph', (path) => {
    const expected = nt(new Parser().parse(golden(mode, path)));
    const actual = nt(graphs.get(path)!);
    const missing = expected.filter((l) => !actual.includes(l));
    const extra = actual.filter((l) => !expected.includes(l));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('passes the structural checks', () => {
    expect(checkProject(project, graphs)).toEqual([]);
  });

  it('writes Turtle that parses back to the same graph, with only used prefixes', async () => {
    for (const e of project.entities) {
      const g = graphs.get(pathOf(project, e))!;
      const ttl = await toTurtle(g, iriOf(project, e));
      expect(nt(new Parser().parse(ttl))).toEqual(nt(g));
      const declared = [...ttl.matchAll(/^@prefix (\w+):/gm)].map((m) => m[1]);
      for (const p of declared) expect(ttl.replace(/^@prefix.*$/gm, '')).toContain(`${p}:`);
      expect(ttl.trimStart().startsWith('@prefix')).toBe(true);
    }
  });
});
