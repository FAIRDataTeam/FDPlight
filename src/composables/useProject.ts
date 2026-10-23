// Editor state for one project: settings, entity tree, form values per
// entity, and everything derived from them (graphs, checks, Turtle).

import { computed, reactive, ref, shallowRef, watch, watchEffect } from 'vue';
import { expandTerm, fieldKey, normalizeRecord, recordHasContent, shapeFields, type RecordNode } from '@fairdatateam/record-core/record';
import type { Quad } from '@fairdatateam/record-core/rdf';
import type { Schema } from '@fairdatateam/record-core/types';
import type { Store } from 'n3';
import { checkProject, type Issue } from '../core/checks';
import type { LoadedProject } from '../core/load';
import { entityForm, userGraphFromForm } from '../core/forms';
import { detectIriMode, validateIriSettings, type IriMode } from '../core/iri';
import { useI18n } from './useI18n';
import { rootType, typeByKey, typeInUse, type EntityType, type ImportedProfile } from '../core/profile';
import type { FileProfile } from '../core/profileFiles';
import { findByPath, iriOf, pathOf, rootPath, stamp, type Entity, type Project } from '../core/project';
import { addChild, moveEntity, moveTargets, removeEntity, renameEntity, type TreeResult } from '../core/tree';
import { checkEntity, shapesGraph, type ShaclFinding } from '../core/validation';
import { DCT, EJP_VP_CONNECTION, EJP_VP_INVISIBLE } from '../core/vocab';
import { serializeEntity, toTurtle } from '../core/wiring';
import { validateIndex } from '../core/ping';
import { DEFAULT_ACCESS_RIGHTS, validateFolder } from '../core/profile';
import { PROFILES, type BundledProfile } from '../profiles';
import { say } from '../core/messages';

export const DEFAULT_BASE = 'https://example.github.io/my-fdp/';

export function newProject(base = DEFAULT_BASE, profile: BundledProfile = PROFILES['fdp-default']): Project {
  return {
    fdplight: '0.1',
    name: 'My FAIR Data Point',
    base,
    iriMode: 'file',
    storageBase: null,
    defaults: {
      language: 'http://id.loc.gov/vocabulary/iso639-1/en',
      license: null,
      accessRightsDescription: DEFAULT_ACCESS_RIGHTS,
      metrics: [],
    },
    types: profile.types,
    ...(profile.use ? { use: [...profile.use] } : {}),
    entities: [{ type: 'fdp', id: '', parent: null }],
  };
}

/** How long the SHACL check waits after the last edit. */
export const SHACL_DELAY_MS = 300;

export function useProject(initial?: Project, profileKey = 'fdp-default') {
  const profile = ref(profileKey);
  /** Name of a profile opened from local files (SPEC §3.3). */
  const fileProfileName = ref('');
  let shapes = PROFILES[profileKey].shapes;
  const project = reactive(initial ?? newProject(DEFAULT_BASE, PROFILES[profileKey])) as Project;
  let forms: Record<string, Schema> = {};
  let shapeQuads: Record<string, ReturnType<typeof shapesGraph>> = {};
  const values = reactive<Record<string, RecordNode>>({});
  /** Unmapped triples per entity, kept from loaded files (SPEC §5.7). */
  const extras = shallowRef<Record<string, Quad[]>>({});
  function loadProfile(): void {
    forms = Object.fromEntries(project.types.map((t) => [t.key, entityForm(t, shapes[t.key])]));
    shapeQuads = Object.fromEntries(project.types.map((t) => [t.key, shapesGraph(shapes[t.key])]));
    for (const k of Object.keys(values)) delete values[k];
    for (const e of project.entities) values[pathOf(project, e)] = normalizeRecord(forms[e.type], {});
  }
  loadProfile();

  const selected = ref('fdp.ttl');
  const lastError = ref('');
  /** Paths already in the repository: their ids are locked (SPEC §2.3). */
  const published = shallowRef(new Set<string>());
  // Preview timestamps for entities never saved; saving stamps them for real.
  const previewTime = new Date();

  const entity = computed(() => findByPath(project, selected.value) ?? project.entities[0]);
  /** The root's file: `fdp.ttl`, or the kept path of an imported root (SPEC §4.2). */
  const root = computed(() => rootPath(project));
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

  /**
   * SPEC §8.6. Whether the selected record is set to ejp:VPInvisible: with the
   * VP's current queries one hidden record can hide others, so the app warns.
   */
  const hiddenFromVp = computed(() => {
    const form = forms[entity.value.type];
    const node = values[selected.value];
    if (!form || !node) return false;
    return shapeFields(form)
      .filter((f) => expandTerm(f.path, form.prefixes) === EJP_VP_CONNECTION)
      .some((f) => (node[fieldKey(f)] ?? []).some((v) => v.value && expandTerm(v.value, form.prefixes) === EJP_VP_INVISIBLE));
  });

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
    const parent = findByPath(project, path)?.parent ?? root.value;
    if (apply(removeEntity(project, path))) selected.value = parent;
  }

  function rename(path: string, newId: string): void {
    if (published.value.has(path)) {
      lastError.value = say('idLocked');
      return;
    }
    const r = renameEntity(project, path, newId.trim());
    if (apply(r, path) && r.ok) selected.value = r.path;
  }

  /** Move under another parent; file and IRI stay, so this works after publishing too. */
  function move(path: string, newParent: string): void {
    if (apply(moveEntity(project, path, newParent))) selected.value = path;
  }

  /** Where the entity at `path` may move, with labels for a picker. */
  function moveOptions(path: string): { path: string; label: string }[] {
    return moveTargets(project, path).map((p) => {
      const e = findByPath(project, p)!;
      return { path: p, label: `${typeOf(e).name}: ${titleOf(p) || (e.parent === null ? useI18n().t('tree.root') : e.id)}` };
    });
  }

  /** SPEC §3.1. Tick or untick a type; a type with records stays in use. */
  function setTypeInUse(key: string, on: boolean): void {
    const all = project.types.filter((t) => t !== rootType(project.types)).map((t) => t.key);
    const now = new Set(project.use ?? all);
    if (!on && project.entities.some((e) => e.type === key)) {
      lastError.value = say('typeHasRecords', { type: typeByKey(project.types, key).name.toLowerCase() });
      return;
    }
    lastError.value = '';
    if (on) now.add(key);
    else now.delete(key);
    project.use = all.filter((k) => now.has(k));
  }

  // ---- settings (SPEC §2.2) ----
  const detectedMode = computed<IriMode | 'ask'>(() => {
    try {
      return detectIriMode(project.base);
    } catch {
      return 'ask';
    }
  });
  const settingsErrors = computed(() => [
    ...validateIriSettings(project),
    ...validateFolder(project.folder ?? ''),
    ...(project.index ? validateIndex(project.index) : []),
  ]);

  /** Whether the user has entered anything that loading a project would replace. */
  const hasLocalWork = () => project.entities.length > 1 || Object.values(values).some(recordHasContent);

  /** Replace the project with one loaded from a repository (SPEC §4.1). */
  function load(loaded: LoadedProject, loadedShapes: Record<string, string>): void {
    shapes = loadedShapes;
    const match = Object.entries(PROFILES).find(([, prof]) => JSON.stringify(prof.types) === JSON.stringify(loaded.project.types));
    profile.value = match ? match[0] : 'repository';
    for (const k of Object.keys(project) as (keyof Project)[]) delete project[k];
    Object.assign(project, loaded.project);
    forms = Object.fromEntries(project.types.map((t) => [t.key, entityForm(t, shapes[t.key])]));
    shapeQuads = Object.fromEntries(project.types.map((t) => [t.key, shapesGraph(shapes[t.key])]));
    for (const k of Object.keys(values)) delete values[k];
    Object.assign(values, loaded.values);
    for (const e of project.entities) {
      const p = pathOf(project, e);
      if (!values[p]) values[p] = normalizeRecord(forms[e.type], {});
    }
    extras.value = loaded.extras;
    selected.value = rootPath(project);
    lastError.value = '';
  }

  /** Start over with another bundled profile, keeping base URI, folder and Index. */
  function switchProfile(key: string): void {
    const next = PROFILES[key];
    if (!next || key === profile.value) return;
    startOver(key, next.types, next.shapes);
    delete project.source;
    if (next.use) project.use = [...next.use];
  }

  /** Start over with a profile imported from a running FDP (SPEC §3, TASKS Phase 1). */
  function useImportedProfile(imported: ImportedProfile): void {
    startOver('imported', imported.types, imported.shapes);
    project.source = imported.source;
  }

  /** Start over with a profile opened from local files (SPEC §3.3). */
  function useFileProfile(p: FileProfile): void {
    startOver('file', p.types, p.shapes);
    delete project.source;
    fileProfileName.value = p.name;
    if (p.use) project.use = [...p.use];
  }

  function startOver(key: string, types: EntityType[], newShapes: Record<string, string>): void {
    profile.value = key;
    shapes = newShapes;
    project.types = types;
    delete project.root;
    delete project.use;
    project.entities = [{ type: rootType(types).key, id: '', parent: null }];
    extras.value = {};
    published.value = new Set();
    selected.value = rootPath(project);
    loadProfile();
  }

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
      const user = userGraphFromForm(forms[e.type], iriOf(project, e), values[path] ?? {}, extras.value[path]);
      out.set(path, serializeEntity(project, stamped, user));
    }
    graphs.value = out;
    issues.value = checkProject(project, out);
  });

  // ---- SHACL check per entity (SPEC §6 rule 1), debounced ----
  const findings = shallowRef(new Map<string, ShaclFinding[]>());
  const checking = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;

  async function checkAll(): Promise<void> {
    const mine = ++run;
    checking.value = true;
    const out = new Map<string, ShaclFinding[]>();
    await Promise.all(
      project.entities.map(async (e) => {
        const path = pathOf(project, e);
        const g = graphs.value.get(path);
        if (!g) return;
        out.set(path, await checkEntity(forms[e.type], iriOf(project, e), values[path] ?? {}, g, shapeQuads[e.type]));
      }),
    );
    if (mine !== run) return; // a newer edit started another run
    findings.value = out;
    checking.value = false;
  }

  watch(graphs, () => {
    clearTimeout(timer);
    timer = setTimeout(checkAll, SHACL_DELAY_MS);
  }, { immediate: true });

  const errorCount = (path: string): number => (findings.value.get(path) ?? []).filter((f) => f.severity === 'error').length;
  const totalErrors = computed(() => [...findings.value.values()].flat().filter((f) => f.severity === 'error').length);

  watchEffect(async () => {
    const g = graphs.value.get(selected.value);
    const iri = settingsErrors.value.length ? '' : iriOf(project, entity.value);
    turtle.value = g ? await toTurtle(g, iri) : '';
  });

  return {
    project,
    profile,
    get forms() {
      return forms;
    },
    get shapes() {
      return shapes;
    },
    switchProfile,
    useImportedProfile,
    useFileProfile,
    fileProfileName,
    load,
    hasLocalWork,
    extras,
    values,
    selected,
    entity,
    hiddenFromVp,
    lastError,
    typeOf,
    titleOf,
    pathOf: (e: Entity) => pathOf(project, e),
    published,
    add,
    remove,
    rename,
    setTypeInUse,
    typeInUse: (key: string) => typeInUse(project, key),
    move,
    moveOptions,
    root,
    setBase,
    setMode,
    detectedMode,
    settingsErrors,
    graphs,
    issues,
    turtle,
    findings,
    checking,
    checkAll,
    errorCount,
    totalErrors,
  };
}

export type ProjectState = ReturnType<typeof useProject>;
