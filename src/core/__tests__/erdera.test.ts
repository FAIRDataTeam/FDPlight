// Forms and checks from real ERDERA shapes (TASKS Phase 2). A patient
// registry's form merges the Resource shape and the PatientRegistry shape, as
// the RI's /patientregistry/spec does (the schema extends Resource).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expandTerm, fieldKey, nestedShapeOf, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm, userGraphFromForm } from '../forms';
import type { EntityType } from '../profile';
import { iriOf, stamp, type Project } from '../project';
import { checkEntity, shapesGraph } from '../validation';
import { DCT, NS } from '../vocab';
import { serializeEntity, toTurtle } from '../wiring';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

const fixture = (f: string) => readFileSync(fileURLToPath(new URL(`./fixtures/erdera-config/${f}`, import.meta.url)), 'utf8');
const EJP = 'https://w3id.org/ejp-rd/vocabulary#';
const SHAPES = fixture('resource.ttl') + '\n' + fixture('patient-registry.ttl');

const REGISTRY: EntityType = {
  key: 'patientregistry',
  name: 'Patient Registry',
  urlPrefix: 'patientregistry',
  targetClasses: [`${NS.dcat}Resource`, `${EJP}PatientRegistry`],
  shapes: 'shapes/patientregistry.ttl',
  children: [],
};

function project(license: string | null): Project {
  const p = defaultProject(FILE_MODE);
  p.types = [
    ...FDP_DEFAULT.types.map((t) =>
      t.key === 'catalog' ? { ...t, children: [...t.children, { type: 'patientregistry', relation: `${NS.dct}hasPart`, title: 'Patient Registries' }] } : t,
    ),
    REGISTRY,
  ];
  p.defaults = { ...p.defaults, license };
  p.entities = [...p.entities, { type: 'patientregistry', id: 'eprovide', parent: 'catalog/rare-diseases.ttl', issued: '2026-10-22T00:00:00.000Z', modified: '2026-10-22T00:00:00.000Z' }];
  return p;
}

const form = entityForm(REGISTRY, SHAPES);
const field = (iri: string) => shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === iri);

function setValue(values: RecordNode, f: Schema, iri: string, value: string, lang = '') {
  const x = shapeFields(f).find((y) => expandTerm(y.path, f.prefixes) === iri)!;
  values[fieldKey(x)][0].value = value;
  values[fieldKey(x)][0].lang = lang;
}

async function check(p: Project, values: RecordNode) {
  const e = p.entities.find((x) => x.type === 'patientregistry')!;
  const iri = iriOf(p, e);
  const g = serializeEntity(p, stamp(e, new Date('2026-10-23T00:00:00Z')), userGraphFromForm(form, iri, values));
  return { g, iri, findings: await checkEntity(form, iri, values, g, shapesGraph(SHAPES)) };
}

describe('ERDERA patient registry (Resource + PatientRegistry shapes)', () => {
  it('merges both shapes into one form', () => {
    for (const p of [DCT.title, DCT.description, `${NS.dcat}theme`, `${NS.dcat}keyword`, `${EJP}vpConnection`, `${EJP}populationCoverage`])
      expect(field(p), p).toBeDefined();
  });

  it('keeps nested shapes as sub-forms: publisher (OrgShape) and population coverage (AnnotationShape)', () => {
    const pub = field(`${NS.dct}publisher`)!;
    expect(pub.widgetId).toBe('DetailsEditor');
    expect(nestedShapeOf(form, pub)?.targetClass).toBe('foaf:Organization');
    const cov = field(`${EJP}populationCoverage`)!;
    expect(cov.widgetId).toBe('DetailsEditor');
    expect(nestedShapeOf(form, cov)?.targetClass).toBe('sio:SIO_001166');
  });

  it('keeps dct:conformsTo as a field: ERDERA lets users declare standards, FDPlight adds the profile beside them', () => {
    expect(field(`${NS.dct}conformsTo`)).toBeDefined();
  });

  it('checks the complete file: project defaults satisfy the required language and licence', async () => {
    const values = normalizeRecord(form, {});
    const required = async (p: Project) =>
      (await check(p, values)).findings
        .filter((f) => f.component === 'MinCount')
        .map((f) => shapeFields(form).find((x) => fieldKey(x) === f.loc))
        .map((x) => (x ? expandTerm(x.path, form.prefixes) : null));
    const withDefaults = await required(project('https://w3id.org/ejp-rd/resources/licenses/v1.0'));
    expect(withDefaults).toContain(DCT.title);
    expect(withDefaults).toContain(`${NS.dcat}keyword`);
    expect(withDefaults).not.toContain(`${NS.dct}language`); // project default language
    expect(withDefaults).not.toContain(`${NS.dct}license`); // project default licence
    expect(await required(project(null))).toContain(`${NS.dct}license`);
  });

  it('writes the registry as a child of its catalog through dct:hasPart', async () => {
    const values = normalizeRecord(form, {});
    setValue(values, form, DCT.title, 'ePROVIDE', 'en');
    const p = project(null);
    const { g, iri } = await check(p, values);
    const ttl = await toTurtle(g, iri);
    expect(ttl).toContain('a dcat:Resource, ejp:PatientRegistry');
    expect(ttl).toContain(`dct:isPartOf <${FILE_MODE.base}catalog/rare-diseases.ttl>`);
    const catalog = p.entities.find((x) => x.type === 'catalog')!;
    const cg = serializeEntity(p, catalog, userGraphFromForm(entityForm(p.types[1], FDP_DEFAULT.shapes.catalog), iriOf(p, catalog), normalizeRecord(entityForm(p.types[1], FDP_DEFAULT.shapes.catalog), {})));
    const cttl = await toTurtle(cg, iriOf(p, catalog));
    expect(cttl).toContain(`dct:hasPart <${iri}>`);
    expect(cttl).toContain('dct:title "Patient Registries"');
  });
});
