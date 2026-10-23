// The bundled ERDERA profile (decided 2026-10-23): types, shapes, the
// profile's default triples, types in use, and children that share dct:hasPart.
// @vitest-environment node
import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import { entityForm, userGraphFromForm } from '../../core/forms';
import { loadProject } from '../../core/load';
import { parseProjectFile, typeByKey, validateTypes } from '../../core/profile';
import { iriOf, pathOf, stamp, type Project } from '../../core/project';
import { planPublish } from '../../core/publish';
import { addChild } from '../../core/tree';
import { serializeEntity, toTurtle } from '../../core/wiring';
import { newProject } from '../../composables/useProject';
import { ERDERA } from '../erdera';

const EJP = 'https://w3id.org/ejp-rd/vocabulary#';
const forms = Object.fromEntries(ERDERA.types.map((t) => [t.key, entityForm(t, ERDERA.shapes[t.key])]));

function project(use?: string[]): Project {
  const p = newProject('https://erdera.github.io/my-fdp/', ERDERA);
  if (use) p.use = use;
  return p;
}

const turtleOf = async (p: Project, path: string, values?: RecordNode) => {
  const e = p.entities.find((x) => pathOf(p, x) === path)!;
  const iri = iriOf(p, e);
  const g = serializeEntity(p, stamp(e, new Date('2026-10-23T00:00:00Z')), userGraphFromForm(forms[e.type], iri, values ?? normalizeRecord(forms[e.type], {})));
  return toTurtle(g, iri);
};

describe('ERDERA profile', () => {
  it('has valid types, a form for every type, and starts with the FDP chain in use', () => {
    expect(validateTypes(ERDERA.types)).toEqual([]);
    expect(ERDERA.types.map((t) => t.key)).toEqual(['fdp', 'catalog', 'dataset', 'distribution', 'patientregistry', 'biobank', 'guideline', 'dataservice', 'dataservice2']);
    for (const t of ERDERA.types) expect(shapeFields(forms[t.key]).length, t.key).toBeGreaterThan(0);
    expect(project().use).toEqual(['catalog', 'dataset', 'distribution']);
    // The root is not a dcat:DataService (ERDERA removes that inheritance).
    expect(typeByKey(ERDERA.types, 'fdp').targetClasses).not.toContain('http://www.w3.org/ns/dcat#DataService');
  });

  it('writes ejp:vpConnection ejp:VPDiscoverable unless hidden, and fdp:conformsToFdpSpec on the root', async () => {
    const p = project();
    const r = addChild(p, 'fdp.ttl', 'catalog', 'rare');
    if (!r.ok) throw new Error(r.error);
    p.entities = r.entities;
    const root = await turtleOf(p, 'fdp.ttl');
    expect(root).toContain('ejp:vpConnection ejp:VPDiscoverable');
    expect(root).toContain('fdp:conformsToFdpSpec <https://w3id.org/fdp/fdp-o/1.2>');
    expect(await turtleOf(p, 'catalog/rare.ttl')).toContain('ejp:vpConnection ejp:VPDiscoverable');

    const hidden = normalizeRecord(forms.catalog, {});
    const vp = shapeFields(forms.catalog).find((f) => expandTerm(f.path, forms.catalog.prefixes) === `${EJP}vpConnection`)!;
    hidden[fieldKey(vp)][0].value = 'ejp:VPInvisible'; // as the drop-down stores it
    const ttl = await turtleOf(p, 'catalog/rare.ttl', hidden);
    expect(ttl).toContain('ejp:vpConnection ejp:VPInvisible');
    expect(ttl).not.toContain('VPDiscoverable');
  });

  it('offers and wires only the types in use', async () => {
    const p = project();
    const r = addChild(p, 'fdp.ttl', 'catalog', 'rare');
    if (!r.ok) throw new Error(r.error);
    p.entities = r.entities;
    expect(addChild(p, 'catalog/rare.ttl', 'biobank')).toEqual({ ok: false, error: 'Biobank is not in use in this project' });
    const cat = await turtleOf(p, 'catalog/rare.ttl');
    expect(cat).toContain('dct:title "Datasets"');
    expect(cat).not.toContain('Biobanks');
    p.use = [...p.use!, 'biobank'];
    expect(await turtleOf(p, 'catalog/rare.ttl')).toContain('dct:title "Biobanks"');
  });

  it('tells registries, biobanks and guidelines apart on reload, though all use dct:hasPart', async () => {
    const p = project(['catalog', 'patientregistry', 'biobank', 'guideline']);
    let entities = p.entities;
    for (const [parent, type, id] of [
      ['fdp.ttl', 'catalog', 'rare'],
      ['catalog/rare.ttl', 'patientregistry', 'eprovide'],
      ['catalog/rare.ttl', 'biobank', 'bb1'],
      ['catalog/rare.ttl', 'guideline', 'g1'],
    ]) {
      const r = addChild({ ...p, entities }, parent, type, id);
      if (!r.ok) throw new Error(r.error);
      entities = r.entities;
    }
    p.entities = entities;
    const values = Object.fromEntries(p.entities.map((e) => [pathOf(p, e), normalizeRecord(forms[e.type], {})]));
    const plan = await planPublish({ project: p, forms, values, shapes: ERDERA.shapes, remote: new Map(), remoteFiles: [], now: new Date('2026-10-23T00:00:00Z') });
    const json = plan.changes.find((c) => c.path === 'fdplight.json')!.content!;
    expect(JSON.parse(json).use).toEqual(['catalog', 'patientregistry', 'biobank', 'guideline']);
    const settings = parseProjectFile(json);
    if (!settings.ok) throw new Error(settings.errors.join('; '));
    const files = new Map(plan.changes.filter((c) => c.path.endsWith('.ttl') && !c.path.startsWith('shapes/')).map((c) => [c.path, c.content!]));
    const loaded = loadProject(settings.value, files, forms);
    expect(loaded.report).toEqual([]);
    expect(loaded.project.entities.map((e) => `${e.type} ${pathOf(loaded.project, e)}`).sort()).toEqual([
      'biobank biobank/bb1.ttl',
      'catalog catalog/rare.ttl',
      'fdp fdp.ttl',
      'guideline guideline/g1.ttl',
      'patientregistry patientregistry/eprovide.ttl',
    ]);
  });

  it('turns a type back on when the repository has records of it', () => {
    const p = project();
    const files = new Map([
      ['fdp.ttl', `<${p.base}fdp.ttl> <https://w3id.org/fdp/fdp-o#metadataCatalog> <${p.base}catalog/c.ttl> .`],
      ['catalog/c.ttl', `<${p.base}catalog/c.ttl> <http://purl.org/dc/terms/hasPart> <${p.base}biobank/b.ttl> .`],
      ['biobank/b.ttl', `<${p.base}biobank/b.ttl> a <${EJP}Biobank>, <http://www.w3.org/ns/dcat#Resource> .`],
    ]);
    const loaded = loadProject({ ...p, use: ['catalog'] }, files, forms);
    expect(loaded.project.entities.map((e) => e.type)).toEqual(['fdp', 'catalog', 'biobank']);
    expect(loaded.project.use).toEqual(['catalog', 'biobank']);
    expect(loaded.report).toContain('Biobank: the repository has records of this type, so it is now in use');
  });
});
