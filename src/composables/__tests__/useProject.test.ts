import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { expandTerm, fieldKey, shapeFields } from '@fairdatateam/record-core/record';
import { DCT } from '../../core/vocab';
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
});
