import { expandTerm, fieldKey, nestedShapeOf, normalizeRecord, shapeFields } from '@fairdatateam/record-core/record';
import { FDP_DEFAULT } from '../../profiles/fdp-default';
import { entityForm, userGraphFromForm } from '../forms';
import { typesFromResourceDefinitions, typeByKey } from '../profile';
import { DCT, FDP, NS } from '../vocab';
import { recordedResourceDefinitions } from './fixtures/defaultTree';

const form = (key: string) => entityForm(typeByKey(FDP_DEFAULT.types, key), FDP_DEFAULT.shapes[key]);
const paths = (key: string) => {
  const f = form(key);
  return shapeFields(f).map((x) => expandTerm(x.path, f.prefixes));
};

describe('bundled FDP default profile (SPEC §3.2)', () => {
  it('matches the recorded resource definitions', () => {
    expect(FDP_DEFAULT.types).toEqual(typesFromResourceDefinitions(recordedResourceDefinitions));
  });
});

describe('entityForm (TASKS Phase 2)', () => {
  it('merges the Resource and Dataset shapes, general fields first', () => {
    expect(paths('dataset').slice(0, 3)).toEqual([DCT.title, DCT.description, `${NS.dct}publisher`]);
  });

  it('hides what the wiring generates, per type', () => {
    expect(paths('dataset')).toContain(DCT.issued); // user data on datasets
    expect(paths('catalog')).not.toContain(DCT.issued); // system value on catalogs
    expect(paths('catalog')).not.toContain(DCT.modified);
    for (const p of [FDP.metadataIdentifier, FDP.metadataIssued, FDP.metadataModified, 'http://www.w3.org/ns/dcat#endpointURL'])
      expect(paths('fdp')).not.toContain(p);
    expect(paths('fdp')).toContain('http://www.w3.org/ns/dcat#endpointDescription');
  });

  it('turns form values into the user graph of the entity', () => {
    const f = form('dataset');
    const values = normalizeRecord(f, {});
    const title = shapeFields(f).find((x) => expandTerm(x.path, f.prefixes) === DCT.title)!;
    values[fieldKey(title)][0].value = 'My dataset';
    values[fieldKey(title)][0].lang = 'en';
    const g = userGraphFromForm(f, 'https://example.github.io/my-fdp/dataset/x.ttl', values);
    const t = g.getQuads('https://example.github.io/my-fdp/dataset/x.ttl', DCT.title, null, null)[0].object;
    expect([t.value, (t as { language?: string }).language]).toEqual(['My dataset', 'en']);
  });

  it('renders a publisher (sh:node AgentShape) as a sub-form and names its node E#publisher (SPEC §5.6)', () => {
    const f = form('dataset');
    const pub = shapeFields(f).find((x) => expandTerm(x.path, f.prefixes) === `${NS.dct}publisher`)!;
    expect(pub.widgetId).toBe('DetailsEditor');
    expect(nestedShapeOf(f, pub)?.targetClass).toBe('foaf:Agent');
    const values = normalizeRecord(f, {});
    const node = values[fieldKey(pub)][0].node!;
    node[Object.keys(node)[0]][0].value = 'University of Twente';
    const E = 'https://example.github.io/my-fdp/dataset/x.ttl';
    const g = userGraphFromForm(f, E, values);
    expect(g.getQuads(E, `${NS.dct}publisher`, null, null).map((q) => q.object.value)).toEqual([`${E}#publisher`]);
    expect(g.getQuads(`${E}#publisher`, `${NS.foaf}name`, null, null).map((q) => q.object.value)).toEqual(['University of Twente']);
    expect(values[fieldKey(pub)][0].value).toBe(''); // the stored value keeps no IRI
  });
});
