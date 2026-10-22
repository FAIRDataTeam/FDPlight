// Editor state for one project: settings, entity tree, form values per
// entity, and everything derived from them (graphs, checks, Turtle).

import { computed, reactive, ref, shallowRef, watchEffect } from 'vue';
import { expandTerm, fieldKey, normalizeRecord, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import type { Store } from 'n3';
import { checkProject, type Issue } from '../core/checks';
import { entityForm, userGraphFromForm } from '../core/forms';
import { detectIriMode, validateIriSettings, type IriMode } from '../core/iri';
import { typeByKey, type EntityType } from '../core/profile';
import { findByPath, iriOf, pathOf, stamp, type Entity, type Project } from '../core/project';
import { addChild, removeEntity, renameEntity, type TreeResult } from '../core/tree';
import { DCT } from '../core/vocab';
import { serializeEntity, toTurtle } from '../core/wiring';
import { FDP_DEFAULT } from '../profiles/fdp-default';

export const DEFAULT_BASE = 'https://example.github.io/my-fdp/';

export function newProject(base = DEFAULT_BASE): Project {
  return {
    fdplight: '0.1',
    name: 'My FAIR Data Point',
    base,
    iriMode: 'file',
    storageBase: null,
    defaults: {
      language: 'http://id.loc.gov/vocabulary/iso639-1/en',
      license: null,
      accessRightsDescription: null,
      metrics: [],
    },
    types: FDP_DEFAULT.types,
    entities: [{ type: 'fdp', id: '', parent: null }],
  };
}

export function useProject(initial: Project = newProject(), shapes: Record<string, string> = FDP_DEFAULT.shapes) {
  const project = reactive(initial) as Project;
  const forms: Record<string, Schema> = Object.fromEntries(project.types.map((t) => [t.key, entityForm(t, shapes[t.key])]));
  const values = reactive<Record<string, RecordNode>>({});
  for (const e of project.entities) values[pathOf(project, e)] = normalizeRecord(forms[e.type], {});

  const selected = ref('fdp.ttl');
  const lastError = ref('');
  // Preview timestamps for entities never saved; saving stamps them for real.
  const previewTime = new Date();

  const entity = computed(() => findByPath(project, selected.value) ?? project.entities[0]);
  const typeOf = (e: Entity): EntityType => typeByKey(project.types, e.type);

  /** The entity's English (else first) title from its form, or '' . */
  function titleOf(path: string): string {
    const e = findByPath(project, path);
    const node = values[path];
    if (!e || !node) return '';
    const form = forms[e.type];
    const f = shapeFields(form).find((x) => expandTerm(x.path, form.prefixes) === DCT.title);
    const list = (f && node[fieldKey(f)]) || [];
    const filled = list.filter((v) => v.value.trim());
    return (filled.find((v) => (v.lang || '').startsWith('en')) ?? filled[0])?.value.trim() ?? '';
  }

  function apply(r: TreeResult, from?: string): boolean {
    if (!r.ok) {
      lastError.value = r.error;
      return false;
    }
    lastError.value = '';
    project.entities = r.entities;
    if (from && from !== r.path) {
      values[r.path] = values[from];
      delete values[from];
    }
    for (const e of project.entities) {
      const p = pathOf(project, e);
      if (!values[p]) values[p] = normalizeRecord(forms[e.type], {});
    }
    for (const p of Object.keys(values)) if (!findByPath(project, p)) delete values[p];
    return true;
  }

  function add(parentPath: string, childType: string): void {
    const r = addChild(project, parentPath, childType);
    if (apply(r) && r.ok) selected.value = r.path;
  }

  function remove(path: string): void {
    const parent = findByPath(project, path)?.parent ?? 'fdp.ttl';
    if (apply(removeEntity(project, path))) selected.value = parent;
  }

  function rename(path: string, newId: string): void {
    const r = renameEntity(project, path, newId.trim());
    if (apply(r, path) && r.ok) selected.value = r.path;
  }

  // ---- settings (SPEC §2.2) ----
  const detectedMode = computed<IriMode | 'ask'>(() => {
    try {
      return detectIriMode(project.base);
    } catch {
      return 'ask';
    }
  });
  const settingsErrors = computed(() => validateIriSettings(project));

  function setBase(base: string): void {
    project.base = base.trim();
    const mode = detectedMode.value;
    if (mode !== 'ask') setMode(mode);
  }

  function setMode(mode: IriMode): void {
    project.iriMode = mode;
    if (mode === 'file') project.storageBase = null;
    else if (!project.storageBase) project.storageBase = '';
  }

  // ---- derived output ----
  const graphs = shallowRef(new Map<string, Store>());
  const issues = shallowRef<Issue[]>([]);
  const turtle = ref('');

  watchEffect(() => {
    if (settingsErrors.value.length) {
      graphs.value = new Map();
      issues.value = [];
      return;
    }
    const out = new Map<string, Store>();
    for (const e of project.entities) {
      const path = pathOf(project, e);
      const stamped = e.issued && e.modified ? e : stamp(e, previewTime);
      const user = userGraphFromForm(forms[e.type], iriOf(project, e), values[path] ?? {});
      out.set(path, serializeEntity(project, stamped, user));
    }
    graphs.value = out;
    issues.value = checkProject(project, out);
  });

  watchEffect(async () => {
    const g = graphs.value.get(selected.value);
    const iri = settingsErrors.value.length ? '' : iriOf(project, entity.value);
    turtle.value = g ? await toTurtle(g, iri) : '';
  });

  return {
    project,
    forms,
    values,
    selected,
    entity,
    lastError,
    typeOf,
    titleOf,
    add,
    remove,
    rename,
    setBase,
    setMode,
    detectedMode,
    settingsErrors,
    graphs,
    issues,
    turtle,
  };
}

export type ProjectState = ReturnType<typeof useProject>;
