// Moves FDPlight's own FAIR Data Point (metadata/ of this repository) to the
// persistent base https://w3id.org/fdplight/ (redirect mode, files stay on
// Pages), with the same code the app runs: load the project from the
// repository, re-base (SPEC §2.5), review, publish in one commit.
// Decided by the owner 2026-10-23. Run it only after w3id has merged the rules
// for ids/fdplight/, so the new IRIs resolve when the Index harvests them.
//
//   GH_TOKEN=$(gh auth token) npx vite-node scripts/rebase-own-fdp.ts            # dry run: the plan and the w3id check
//   GH_TOKEN=$(gh auth token) npx vite-node scripts/rebase-own-fdp.ts --commit   # commit to main

import { createClient } from '../src/github/client';
import { useProject } from '../src/composables/useProject';
import { usePublish } from '../src/composables/usePublish';
import { checkRedirect } from '../src/core/w3id';

const REPO = { owner: 'FAIRDataTeam', repo: 'FDPlight', branch: 'main' };
const BASE = 'https://w3id.org/fdplight/';
const STORAGE = 'https://fdplight.fairdatapoint.org/metadata/';

async function main(): Promise<void> {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('set GH_TOKEN');
  const commit = process.argv.includes('--commit');

  const state = useProject();
  state.project.folder = 'metadata/';
  const pub = usePublish(state, (t) => createClient(t), () => true);
  pub.repo.value = REPO;
  pub.token.value = token;
  await pub.connect();
  if (pub.error.value) throw new Error(pub.error.value);
  if (!pub.loaded.value) throw new Error('no FDPlight project found in the repository');
  console.log(`Loaded ${state.project.entities.length} entities from ${REPO.owner}/${REPO.repo}@${pub.head.value.slice(0, 7)}, base ${state.project.base}`);

  if (state.project.base !== BASE) {
    state.setBase(BASE);
    state.project.storageBase = STORAGE;
  }
  if (state.settingsErrors.value.length) throw new Error(state.settingsErrors.value.join('; '));
  console.log(`Base ${state.project.base} (${state.project.iriMode} mode), files at ${state.project.storageBase}`);

  const redirect = await checkRedirect(state.project);
  console.log(`w3id redirect: ${redirect.state}${redirect.state === 'elsewhere' ? ` (${redirect.url})` : ''}`);

  await state.checkAll();
  if (pub.blockers.value.length) throw new Error(`cannot publish: ${pub.blockers.value.join('; ')}`);
  await pub.prepare();
  const plan = pub.plan.value!;
  console.log(`\n${plan.changes.length} file(s) would change:`);
  for (const p of plan.added) console.log(`  add     ${p}`);
  for (const p of plan.updated) console.log(`  update  ${p}`);
  for (const p of plan.removed) console.log(`  remove  ${p}`);
  console.log(`\n${plan.message}`);

  if (!commit) {
    console.log('Dry run: nothing written. Add --commit to publish.');
    return;
  }
  if (redirect.state !== 'ok') throw new Error('w3id does not redirect yet: publish after the w3id pull request is merged');
  await pub.publish();
  if (pub.error.value) throw new Error(pub.error.value);
  console.log(`Published: ${pub.commitUrl.value}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
