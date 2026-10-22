import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { entityForm, userGraphFromForm } from '../../core/forms';
import { typeByKey, validateTypes } from '../../core/profile';
import { iriOf, stamp, type Project } from '../../core/project';
import { checkEntity, findingText, shapesGraph } from '../../core/validation';
import { serializeEntity, toTurtle } from '../../core/wiring';
import { SOFTWARE } from '../software';

const S = 'https://schema.org/';
const form = (key: string) => entityForm(typeByKey(SOFTWARE.types, key), SOFTWARE.shapes[key]);
const paths = (f: Schema) => shapeFields(f).map((x) => expandTerm(x.path, f.prefixes)!.replace(/^.*[#/]/, ''));

function set(f: Schema, v: RecordNode, local: string, value: string, lang = '') {
  const field = shapeFields(f).find((x) => expandTerm(x.path, f.prefixes)!.endsWith(`/${local}`) || expandTerm(x.path, f.prefixes)!.endsWith(`#${local}`))!;
  const entry = v[fieldKey(field)][0];
  if (entry.node) entry.node[Object.keys(entry.node)[0]][0].value = value;
  else Object.assign(entry, { value, lang });
}

const project: Project = {
  fdplight: '0.1',
  name: 'FDPlight',
  base: 'https://fdplight.fairdatapoint.org/metadata/',
  iriMode: 'file',
  storageBase: null,
  defaults: { language: 'http://id.loc.gov/vocabulary/iso639-1/en', license: null, accessRightsDescription: null, metrics: [] },
  types: SOFTWARE.types,
  entities: [
    { type: 'fdp', id: '', parent: null },
    { type: 'catalog', id: 'software', parent: 'fdp.ttl' },
    { type: 'software', id: 'fdplight', parent: 'catalog/software.ttl' },
    { type: 'source-code', id: 'fdplight', parent: 'software/fdplight.ttl' },
  ].map((e) => stamp(e, new Date('2026-10-22T12:00:00Z'))),
};

describe('Software profile', () => {
  it('is a valid profile: FDP → Catalog → Software → Source code', () => {
    expect(validateTypes(SOFTWARE.types)).toEqual([]);
    expect(SOFTWARE.types.map((t) => [t.key, t.urlPrefix, t.children.map((c) => c.relation)])).toEqual([
      ['fdp', '', ['https://w3id.org/fdp/fdp-o#metadataCatalog']],
      ['catalog', 'catalog', ['http://www.w3.org/ns/dcat#resource']],
      ['software', 'software', ['https://schema.org/hasPart']],
      ['source-code', 'source-code', []],
    ]);
  });

  it('forms merge the generic Resource fields with the software fields', () => {
    expect(paths(form('software'))).toEqual(['title', 'description', 'publisher', 'version', 'language', 'license', 'rights', 'url', 'applicationCategory', 'operatingSystem', 'softwareRequirements']);
    expect(paths(form('source-code')).slice(-3)).toEqual(['codeRepository', 'programmingLanguage', 'runtimePlatform']);
  });

  it('a filled-in software record passes its shapes and links its source code', async () => {
    const e = project.entities[2];
    const f = form('software');
    const v = normalizeRecord(f, {});
    set(f, v, 'title', 'FDPlight', 'en');
    set(f, v, 'publisher', 'FAIR Data Team');
    set(f, v, 'version', '0.1.0');
    set(f, v, 'url', 'https://fdplight.fairdatapoint.org/');
    const iri = iriOf(project, e);
    const g = serializeEntity(project, e, userGraphFromForm(f, iri, v));
    const findings = await checkEntity(f, iri, v, g, shapesGraph(SOFTWARE.shapes.software));
    expect(findings.map((f) => findingText(f))).toEqual([]);
    const ttl = await toTurtle(g, iri);
    expect(ttl).toContain('a dcat:Resource, schema:SoftwareApplication');
    expect(ttl).toContain('schema:hasPart <https://fdplight.fairdatapoint.org/metadata/source-code/fdplight.ttl>');
    expect(ttl).toContain(`@prefix schema: <${S}>`);
    expect(ttl).toContain('dct:isPartOf <https://fdplight.fairdatapoint.org/metadata/catalog/software.ttl>');
  });

  it('requires the code repository and the language on source code', async () => {
    const e = project.entities[3];
    const f = form('source-code');
    const v = normalizeRecord(f, {});
    const iri = iriOf(project, e);
    const g = serializeEntity(project, e, userGraphFromForm(f, iri, v));
    const missing = (await checkEntity(f, iri, v, g, shapesGraph(SOFTWARE.shapes['source-code']))).map((x) => x.loc);
    expect(missing).toEqual(expect.arrayContaining(['schema:codeRepository', 'schema:programmingLanguage']));
  });
});
