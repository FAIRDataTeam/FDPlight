// What home.fairdatapoint.org knows about FDPlight's own FDP (TASKS Phase 7).
//   npx vite-node scripts/index-status.ts
import { fetchIndexStatus } from '../src/core/indexStatus';

const BASE = 'https://fdplight.fairdatapoint.org/metadata/';
const ENTITIES = ['fdp.ttl', 'catalog/software.ttl', 'software/fdplight.ttl', 'source-code/fdplight.ttl'].map((p) => BASE + p);

const s = await fetchIndexStatus('https://home.fairdatapoint.org', ENTITIES[0], ENTITIES);
if (!s.entry) console.log('Not in the Index yet.');
else {
  console.log(`${s.entry.state}, registered ${s.entry.registrationTime}, updated ${s.entry.modificationTime}`);
  console.log(`harvested ${s.harvested.length} of ${ENTITIES.length}: ${s.dataUrl}`);
  for (const m of s.missing) console.log(`  not harvested: ${m}`);
}
