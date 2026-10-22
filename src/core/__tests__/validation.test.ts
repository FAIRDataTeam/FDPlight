import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm, userGraphFromForm } from '../forms';
import { typeByKey } from '../profile';
import { iriOf, stamp, type Project } from '../project';
import { checkEntity, findingText, shapesGraph } from '../validation';
import { DCT, NS } from '../vocab';
import { serializeEntity } from '../wiring';
import { defaultProject, FILE_MODE } from './fixtures/defaultTree';

function setup(p: Project, path: string) {
  const e = p.entities.find((x) => (x.type === 'fdp' ? 'fdp.ttl' : `${x.type}/${x.id}.ttl`) === path)!;
  const t = typeByKey(p.types, e.type);
  const form = entityForm(t, FDP_DEFAULT.shapes[t.key]);
  const values = normalizeRecord(form, {});
  const run = () => {
    const iri = iriOf(p, e);
    const g = serializeEntity(p, stamp(e, new Date()), userGraphFromForm(form, iri, values));
    return checkEntity(form, iri, values, g, shapesGraph(FDP_DEFAULT.shapes[t.key]));
  };
  return { form, values, run };
}

function set(form: Schema, values: RecordNode, iri: string, value: string, lang = '') {
  const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === iri)!;
  values[fieldKey(f)][0].value = value;
  values[fieldKey(f)][0].lang = lang;
}

function setPublisher(form: Schema, values: RecordNode, name: string) {
  const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === `${NS.dct}publisher`)!;
  const node = values[fieldKey(f)][0].node!;
  const nameKey = Object.keys(node).find((k) => k.endsWith(':name'))!;
  node[nameKey][0].value = name;
}

describe('checkEntity (SPEC §6 rule 1)', () => {
  it('reports the empty required fields of a dataset, on their form fields', async () => {
    const { run } = setup(defaultProject(FILE_MODE), 'dataset/registry-2024.ttl');
    const findings = await run();
    expect(findings.map((f) => `${f.loc} ${findingText(f)}`).sort()).toEqual([
      'dcat:theme Required',
      'dcat:version Required',
      'dct:publisher Required',
      'dct:title Required',
    ]);
  });

  it('accepts a filled-in dataset; the generated wiring satisfies every shape', async () => {
    const { form, values, run } = setup(defaultProject(FILE_MODE), 'dataset/registry-2024.ttl');
    set(form, values, DCT.title, 'Registry 2024', 'en');
    setPublisher(form, values, 'University of Twente');
    set(form, values, `${NS.dcat}version`, '1.0');
    set(form, values, `${NS.dcat}theme`, 'http://www.wikidata.org/entity/Q929833');
    expect(await run()).toEqual([]);
  });

  it('reports a publisher without a name (AgentShape via sh:node)', async () => {
    const { run } = setup(defaultProject(FILE_MODE), 'dataset/registry-2024.ttl');
    const findings = await run();
    expect(findings.some((f) => f.loc === 'dct:publisher' && f.component === 'MinCount')).toBe(true);
  });

  it('reports a wrong datatype', async () => {
    const { form, values, run } = setup(defaultProject(FILE_MODE), 'dataset/registry-2024.ttl');
    set(form, values, DCT.issued, 'yesterday');
    const issued = (await run()).find((f) => f.loc === 'dct:issued');
    expect(issued && findingText(issued)).toBe('Wrong kind of value');
  });
});
