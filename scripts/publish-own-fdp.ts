// Publishes FDPlight's own FAIR Data Point (metadata about FDPlight, under
// metadata/ of this repository) with the same code the app uses: Software
// profile, wiring, SHACL check, one commit. First run of the Phase 7 pilot.
//
//   GH_TOKEN=$(gh auth token) npx vite-node scripts/publish-own-fdp.ts          # dry run: show the plan
//   GH_TOKEN=$(gh auth token) npx vite-node scripts/publish-own-fdp.ts --show   # dry run, print the entity files
//   GH_TOKEN=$(gh auth token) npx vite-node scripts/publish-own-fdp.ts --commit # commit to main
//
// Later edits are meant to be made in the app at https://fdplight.fairdatapoint.org/.

import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { checkProject } from '../src/core/checks';
import { userGraphFromForm } from '../src/core/forms';
import { pathOf, stamp, type Project } from '../src/core/project';
import { planPublish } from '../src/core/publish';
import { checkEntity, findingText, shapesGraph } from '../src/core/validation';
import { serializeEntity } from '../src/core/wiring';
import { createClient } from '../src/github/client';
import { useProject } from '../src/composables/useProject';
import { PROFILES } from '../src/profiles';

const REPO = { owner: 'FAIRDataTeam', repo: 'FDPlight', branch: 'main' };
const PUBLISHER = 'FAIR Data Team';
const MIT = 'https://spdx.org/licenses/MIT';

/** Form values per entity, by the local name of each field's path. */
const RECORDS: Record<string, Record<string, string | string[]>> = {
  'fdp.ttl': {
    title: 'FDPlight FAIR Data Point',
    description: 'Metadata about FDPlight, published with FDPlight itself as a file-only FAIR Data Point on GitHub Pages.',
    publisher: PUBLISHER,
    version: '0.1.0',
  },
  'catalog/software.ttl': {
    title: 'FAIR Data Team software',
    description: 'Software of the FAIR Data Team.',
    publisher: PUBLISHER,
    version: '0.1.0',
  },
  'software/fdplight.ttl': {
    title: 'FDPlight',
    description:
      'A serverless FAIR Data Point. Data stewards fill in forms generated from SHACL metadata schemas; FDPlight writes one correctly wired Turtle file per catalog, dataset or other resource, commits them to a GitHub repository served by GitHub Pages, and pings the FDP Index.',
    publisher: PUBLISHER,
    version: '0.1.0',
    license: MIT,
    url: 'https://fdplight.fairdatapoint.org/',
    applicationCategory: 'Metadata publishing',
    operatingSystem: 'Web browser',
    softwareRequirements: 'A GitHub repository served by GitHub Pages',
  },
  'source-code/fdplight.ttl': {
    title: 'FDPlight source code',
    description: 'Vue 3 and TypeScript single-page app, built with Vite into one self-contained HTML file.',
    publisher: PUBLISHER,
    version: '0.1.0',
    license: MIT,
    codeRepository: 'https://github.com/FAIRDataTeam/FDPlight',
    programmingLanguage: ['TypeScript', 'Vue'],
    runtimePlatform: ['Web browser', 'Node.js 22 (build)'],
  },
};
const LANGUAGE_TAGGED = new Set(['title', 'description']);

function fill(form: Schema, node: RecordNode, record: Record<string, string | string[]>): void {
  for (const f of shapeFields(form)) {
    const local = (expandTerm(f.path, form.prefixes) ?? '').replace(/^.*[#/]/, '');
    const v = record[local];
    if (v === undefined) continue;
    const list = Array.isArray(v) ? v : [v];
    const key = fieldKey(f);
    node[key] = list.map((value, i) => {
      const entry = { ...(node[key]?.[i] ?? node[key][0]) };
      if (entry.node) {
        // Nested (publisher): fill its name field.
        const inner = { ...entry.node };
        const nameKey = Object.keys(inner)[0];
        inner[nameKey] = [{ ...inner[nameKey][0], value }];
        return { ...entry, node: inner };
      }
      return { ...entry, value, lang: LANGUAGE_TAGGED.has(local) ? 'en' : '' };
    });
  }
}

async function main(): Promise<void> {
  const commit = process.argv.includes('--commit');
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('set GH_TOKEN, e.g. GH_TOKEN=$(gh auth token)');

  const state = useProject(undefined, 'software');
  const p: Project = state.project;
  p.name = 'FDPlight';
  p.base = 'https://fdplight.fairdatapoint.org/metadata/';
  p.folder = 'metadata/';
  p.index = { url: 'https://home.fairdatapoint.org', pagesWorkflow: 'Deploy to GitHub Pages' };
  p.defaults.license = null;
  state.add('fdp.ttl', 'catalog');
  state.rename(state.selected.value, 'software');
  state.add('catalog/software.ttl', 'software');
  state.rename(state.selected.value, 'fdplight');
  state.add('software/fdplight.ttl', 'source-code');
  state.rename(state.selected.value, 'fdplight');
  if (state.lastError.value) throw new Error(state.lastError.value);

  for (const e of p.entities) {
    const path = pathOf(p, e);
    fill(state.forms[e.type], state.values[path], RECORDS[path]);
  }

  // The same checks the app runs before publishing.
  const now = new Date();
  const graphs = new Map(
    p.entities.map((e) => {
      const iri = state.project.base + pathOf(p, e);
      return [pathOf(p, e), serializeEntity(p, stamp(e, now), userGraphFromForm(state.forms[e.type], iri, state.values[pathOf(p, e)]))];
    }),
  );
  const structural = checkProject(p, graphs).filter((i) => i.severity === 'error');
  const shacl = [];
  for (const e of p.entities) {
    const path = pathOf(p, e);
    const findings = await checkEntity(state.forms[e.type], p.base + path, state.values[path], graphs.get(path)!, shapesGraph(PROFILES.software.shapes[e.type]));
    shacl.push(...findings.map((f) => `${path} ${f.loc ?? ''}: ${findingText(f)}`));
  }
  if (structural.length || shacl.length) {
    console.error([...structural.map((i) => `${i.entity}: ${i.message}`), ...shacl].join('\n'));
    throw new Error('the metadata does not pass the checks');
  }

  const client = createClient(token);
  const head = await client.branchHead(REPO);
  const files = await client.listFiles(REPO, head);
  const remote = new Map<string, string | null>();
  for (const f of files.filter((x) => x.startsWith('metadata/') || x === '.github/workflows/fdp-ping.yml'))
    remote.set(f, await client.readFile(REPO, f, head));

  const plan = await planPublish({ project: p, forms: state.forms, values: state.values, shapes: state.shapes, remote, remoteFiles: files, now });
  console.log(plan.message);
  console.log(plan.changes.map((c) => `${c.content === null ? 'delete' : 'write '} ${c.path}`).join('\n'));
  if (process.argv.includes('--show'))
    for (const c of plan.changes) if (c.content && /^metadata\/(?!shapes\/).*\.ttl$/.test(c.path)) console.log(`\n# ${c.path}\n${c.content}`);
  if (!commit) {
    console.log('\nDry run. Add --commit to publish.');
    return;
  }
  if (!plan.changes.length) return;
  const sha = await client.commitFiles(REPO, head, plan.changes, plan.message);
  console.log(`\nPublished https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
