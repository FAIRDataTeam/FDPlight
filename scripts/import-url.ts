// Dry run of "copy an FDP by its URL" (SPEC §4.3) against a live FDP: crawls
// it, prints the report and the files FDPlight would write. Writes nothing.
//
//   npx vite-node scripts/import-url.ts https://w3id.org/simpathic/fdp [--show]

import { entityForm } from '../src/core/forms';
import { importFromUrl } from '../src/core/importUrl';
import { pathOf } from '../src/core/project';
import { planPublish } from '../src/core/publish';
import { newProject } from '../src/composables/useProject';
import { PROFILES } from '../src/profiles';

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) throw new Error('usage: import-url.ts <FDP root URL> [--show]');
  const prof = PROFILES['fdp-default'];
  const settings = newProject('https://example.github.io/copy/', prof);
  const forms = Object.fromEntries(prof.types.map((t) => [t.key, entityForm(t, prof.shapes[t.key])]));
  const r = await importFromUrl({ rootUrl: url, settings, forms });
  if (!r.ok) throw new Error(r.error);
  const l = r.loaded;
  console.log(l.report.join('\n'));
  console.log(`\n${l.project.entities.length} entities:\n${l.project.entities.map((e) => '  ' + pathOf(l.project, e)).join('\n')}`);
  const plan = await planPublish({ project: l.project, forms, values: l.values, extras: l.extras, shapes: prof.shapes, remote: new Map(), remoteFiles: [], now: new Date() });
  if (process.argv.includes('--show')) for (const c of plan.changes.slice(0, 2)) console.log(`\n# ${c.path}\n${c.content}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
