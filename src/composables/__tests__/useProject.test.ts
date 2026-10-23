import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { expandTerm, fieldKey, shapeFields } from '@fairdatateam/record-core/record';
import { DCT } from '../../core/vocab';
import { importProfileFromFdp } from '../../core/profile';
import { recordedFdpFetch } from '../../test/recordedFdp';
import { PROFILES } from '../../profiles';
import { useProject } from '../useProject';

function setTitle(s: ReturnType<typeof useProject>, path: string, title: string) {
  const type = s.project.entities.find((e) => (e.type === 'fdp' ? 'fdp.ttl' : `${e.type}/${e.id}.ttl`) === path)!.type;
  const form = s.forms[type];
  const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === DCT.title)!;
  s.values[path][fieldKey(f)][0].value = title;
  s.values[path][fieldKey(f)][0].lang = 'en';
}

describe('useProject', () => {
  it('starts with a root only and no structural issues', async () => {
    const s = useProject();
    await nextTick();
    expect(s.project.entities).toHaveLength(1);
    expect(s.issues.value).toEqual([]);
    expect(s.graphs.value.has('fdp.ttl')).toBe(true);
  });

  it('adds children, selects them and gives them form values', () => {
    const s = useProject();
    s.add('fdp.ttl', 'catalog');
    expect(s.selected.value).toMatch(/^catalog\/[a-z2-7]{8}\.ttl$/);
    expect(s.values[s.selected.value]).toBeDefined();
    s.add('fdp.ttl', 'dataset');
    expect(s.lastError.value).toBe('a fdp cannot contain a dataset');
  });

  it('renames keep the form values; removing drops the subtree values', () => {
    const s = useProject();
    s.add('fdp.ttl', 'catalog');
    const cat = s.selected.value;
    setTitle(s, cat, 'Rare diseases');
    s.add(cat, 'dataset');
    s.rename(cat, 'rare-diseases');
    expect(s.selected.value).toBe('catalog/rare-diseases.ttl');
    expect(s.titleOf('catalog/rare-diseases.ttl')).toBe('Rare diseases');
    expect(s.project.entities.find((e) => e.type === 'dataset')!.parent).toBe('catalog/rare-diseases.ttl');
    s.remove('catalog/rare-diseases.ttl');
    expect(s.selected.value).toBe('fdp.ttl');
    expect(Object.keys(s.values)).toEqual(['fdp.ttl']);
  });

  it('moves an entity, even a published one, keeping its values; offers labelled targets', () => {
    const s = useProject();
    s.add('fdp.ttl', 'catalog');
    s.rename(s.selected.value, 'a');
    setTitle(s, 'catalog/a.ttl', 'Catalog A');
    s.add('fdp.ttl', 'catalog');
    s.rename(s.selected.value, 'b');
    s.add('catalog/a.ttl', 'dataset');
    const ds = s.selected.value;
    setTitle(s, ds, 'Registry');
    s.published.value = new Set([ds]);
    expect(s.moveOptions(ds)).toEqual([
      { path: 'catalog/a.ttl', label: 'Catalog: Catalog A' },
      { path: 'catalog/b.ttl', label: 'Catalog: b' },
    ]);
    s.move(ds, 'catalog/b.ttl');
    expect(s.lastError.value).toBe('');
    expect(s.project.entities.find((e) => e.type === 'dataset')!.parent).toBe('catalog/b.ttl');
    expect([s.selected.value, s.titleOf(ds)]).toEqual([ds, 'Registry']);
    s.move(ds, 'fdp.ttl');
    expect(s.lastError.value).toBe('a fdp cannot contain a dataset');
  });

  it('detects the IRI mode from the base URI and validates it (SPEC §2.2)', async () => {
    const s = useProject();
    s.setBase('https://w3id.org/example/fdp/');
    expect(s.project.iriMode).toBe('redirect');
    expect(s.settingsErrors.value).toEqual(['redirect mode needs a storage base']);
    s.project.storageBase = 'https://example.github.io/fdp/';
    s.setBase('https://erdera.github.io/fdp/');
    expect(s.project.iriMode).toBe('file');
    expect(s.project.storageBase).toBeNull();
    s.setBase('https://fdp.example.org/');
    expect(s.detectedMode.value).toBe('ask');
    expect(s.project.iriMode).toBe('file'); // unchanged until the user chooses
    s.setBase('not a uri');
    expect(s.settingsErrors.value[0]).toMatch(/base URI/);
  });

  it('keeps the Turtle of the selected entity in step with the form', async () => {
    const s = useProject();
    setTitle(s, 'fdp.ttl', 'My FDP');
    await flushPromises();
    expect(s.turtle.value).toContain('dct:title "My FDP"@en');
    expect(s.turtle.value).toContain('rdfs:label "My FDP"');
  });

  it('runs the SHACL check per entity and counts errors', async () => {
    const s = useProject();
    await s.checkAll();
    expect(s.errorCount('fdp.ttl')).toBe(3);
    setTitle(s, 'fdp.ttl', 'My FDP');
    await nextTick();
    await s.checkAll();
    expect(s.errorCount('fdp.ttl')).toBe(2);
    expect(s.totalErrors.value).toBe(2);
  });

  it('switches to the Software profile, keeping base, folder and Index', async () => {
    const s = useProject();
    s.project.folder = 'metadata/';
    s.project.index = { url: 'https://home.fairdatapoint.org', pagesWorkflow: 'Deploy to GitHub Pages' };
    s.add('fdp.ttl', 'catalog');
    s.switchProfile('software');
    expect(s.project.entities).toHaveLength(1);
    expect(s.project.types.map((t) => t.key)).toEqual(['fdp', 'catalog', 'software', 'source-code']);
    expect([s.project.folder, s.project.index?.pagesWorkflow]).toEqual(['metadata/', 'Deploy to GitHub Pages']);
    s.add('fdp.ttl', 'catalog');
    s.add(s.selected.value, 'software');
    expect(s.selected.value).toMatch(/^software\//);
    expect(s.forms.software).toBeDefined();
    s.project.folder = 'bad';
    expect(s.settingsErrors.value[0]).toMatch(/folder/);
  });

  it('starts over with a profile imported from an FDP, and back to a bundled one', async () => {
    const s = useProject(undefined, 'software');
    s.add('fdp.ttl', 'catalog');
    const imported = await importProfileFromFdp('https://fdp.test', recordedFdpFetch());
    s.useImportedProfile(imported);
    expect(s.profile.value).toBe('imported');
    expect(s.project.source).toEqual(imported.source);
    expect(s.project.types.map((t) => t.key)).toEqual(['fdp', 'catalog', 'dataset', 'distribution']);
    expect(s.project.entities).toEqual([{ type: 'fdp', id: '', parent: null }]);
    expect(Object.keys(s.forms).sort()).toEqual(['catalog', 'dataset', 'distribution', 'fdp']);
    expect(s.shapes.catalog).toBe(imported.shapes.catalog);
    s.add('fdp.ttl', 'catalog');
    expect(s.lastError.value).toBe('');
    s.switchProfile('fdp-default');
    expect([s.profile.value, s.project.source]).toEqual(['fdp-default', undefined]);
  });

  it('starts over with a profile opened from files (SPEC §3.3), with its types in use', () => {
    const s = useProject();
    s.add('fdp.ttl', 'catalog');
    const erdera = PROFILES.erdera;
    s.useFileProfile({ name: 'ERDERA copy', types: erdera.types, shapes: erdera.shapes, use: ['catalog', 'biobank'] });
    expect([s.profile.value, s.fileProfileName.value]).toEqual(['file', 'ERDERA copy']);
    expect(s.project.entities).toEqual([{ type: 'fdp', id: '', parent: null }]);
    expect(s.project.use).toEqual(['catalog', 'biobank']);
    expect(s.typeInUse('dataset')).toBe(false);
    expect(Object.keys(s.forms)).toHaveLength(erdera.types.length);
  });

  it('flags a record set to ejp:VPInvisible (SPEC §8.6)', () => {
    const s = useProject(undefined, 'erdera');
    s.add('fdp.ttl', 'catalog');
    expect(s.hiddenFromVp.value).toBe(false);
    const form = s.forms.catalog;
    const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === 'https://w3id.org/ejp-rd/vocabulary#vpConnection')!;
    s.values[s.selected.value][fieldKey(f)][0].value = 'ejp:VPInvisible';
    expect(s.hiddenFromVp.value).toBe(true);
    s.selected.value = 'fdp.ttl';
    expect(s.hiddenFromVp.value).toBe(false);
  });
});
