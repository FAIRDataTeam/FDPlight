<script setup lang="ts">
// Base URI, IRI mode and storage base (SPEC §2.1 to 2.4).
import { computed, ref, watch } from 'vue';
import { recordHasContent } from '@fairdatateam/record-core/record';
import type { ProjectState } from '../composables/useProject';
import type { IriMode } from '../core/iri';
import { BRANCH_PAGES_WORKFLOW } from '../core/ping';
import { importProfileFromFdp } from '../core/profile';
import { importFromUrl } from '../core/importUrl';
import { profileFromFiles } from '../core/profileFiles';
import { PROFILES } from '../profiles';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{ state: ProjectState }>();
const { t } = useI18n();
const p = props.state.project;

// SPEC §3.1 `use`: the non-root types, to tick the ones the project uses.
const optionalTypes = computed(() => p.types.filter((ty) => ty.urlPrefix !== ''));
const hasRecords = (key: string) => p.entities.some((e) => e.type === key);

const IMPORT = '__import';
const FILES = '__files';
const importing = ref(false);
const openingFiles = ref(false);
const fdpUrl = ref('');
const importError = ref('');
const busy = ref(false);

const hasContent = () => p.entities.length > 1 || Object.values(props.state.values).some(recordHasContent);
const confirmStartOver = () => !hasContent() || window.confirm(t('settings.switchConfirm'));

function chooseProfile(e: Event) {
  const select = e.target as HTMLSelectElement;
  if (select.value === IMPORT || select.value === FILES) {
    importing.value = select.value === IMPORT;
    openingFiles.value = select.value === FILES;
    importError.value = '';
    fileErrors.value = [];
    select.value = props.state.profile.value;
    return;
  }
  if (!confirmStartOver()) {
    select.value = props.state.profile.value;
    return;
  }
  importing.value = false;
  openingFiles.value = false;
  props.state.switchProfile(select.value);
}

/** SPEC §3: the types and shapes of a running FDP (public endpoints, CORS allowed by the RI). */
async function importProfile() {
  importError.value = '';
  busy.value = true;
  try {
    const imported = await importProfileFromFdp(fdpUrl.value.trim());
    if (!confirmStartOver()) return;
    props.state.useImportedProfile(imported);
    importing.value = false;
  } catch (err) {
    importError.value = t('settings.importFailed', { error: err instanceof Error ? err.message : String(err) });
  } finally {
    busy.value = false;
  }
}

// SPEC §3.3: a profile from local files, a JSON with the types and the shapes it names.
const chosenFiles = ref<File[]>([]);
const fileErrors = ref<string[]>([]);
async function openFiles() {
  fileErrors.value = [];
  busy.value = true;
  try {
    const files = await Promise.all(chosenFiles.value.map(async (f) => ({ name: f.name, text: await f.text() })));
    const r = await profileFromFiles(files);
    if (!r.ok) {
      fileErrors.value = r.errors;
      return;
    }
    if (!confirmStartOver()) return;
    props.state.useFileProfile(r.value);
    openingFiles.value = false;
  } finally {
    busy.value = false;
  }
}

// SPEC §4.3: copy a running FDP by its URL, with new IRIs under the base URI.
const copying = ref(false);
const copyUrl = ref('');
const copyError = ref('');
const copyReport = ref<string[]>([]);
async function copyFdp() {
  copyError.value = '';
  copyReport.value = [];
  busy.value = true;
  try {
    const r = await importFromUrl({ rootUrl: copyUrl.value.trim(), settings: p, forms: props.state.forms });
    if (!r.ok) {
      copyError.value = t('settings.copyFailed', { error: r.error });
      return;
    }
    if (hasContent() && !window.confirm(t('settings.copyConfirm'))) return;
    props.state.load(r.loaded, props.state.shapes);
    copyReport.value = r.loaded.report;
    copying.value = false;
  } finally {
    busy.value = false;
  }
}

function toggleIndex(on: boolean) {
  p.index = on ? { url: 'https://home.fairdatapoint.org', pagesWorkflow: BRANCH_PAGES_WORKFLOW } : undefined;
}

const base = ref(p.base);
watch(() => p.base, (b) => (base.value = b));

const MODE_TEXT: Record<IriMode | 'ask', string> = { file: 'settings.modeFile', redirect: 'settings.modeRedirect', ask: 'settings.modeAsk' };
</script>

<template>
  <section class="settings" :aria-label="t('settings.title')">
    <label class="settings__field">
      <span>{{ t('settings.profile') }}</span>
      <select :value="state.profile.value" @change="chooseProfile">
        <option v-for="(prof, key) in PROFILES" :key="key" :value="key">{{ prof.name }}</option>
        <option v-if="state.profile.value === 'repository'" value="repository">{{ t('settings.fromRepository') }}</option>
        <option v-if="state.profile.value === 'imported'" value="imported">{{ t('settings.fromFdp', { url: p.source?.fdp ?? '' }) }}</option>
        <option v-if="state.profile.value === 'file'" value="file">{{ t('settings.fromFiles', { name: state.fileProfileName.value }) }}</option>
        <option :value="IMPORT">{{ t('settings.importFromFdp') }}</option>
        <option :value="FILES">{{ t('settings.openFiles') }}</option>
      </select>
    </label>
    <form v-if="openingFiles" class="settings__import" @submit.prevent="openFiles">
      <label class="settings__field">
        <span>{{ t('settings.profileFiles') }}</span>
        <input
          type="file"
          multiple
          required
          accept=".json,.ttl,application/json,text/turtle"
          @change="chosenFiles = [...(($event.target as HTMLInputElement).files ?? [])]"
        />
      </label>
      <p class="settings__hint">{{ t('settings.profileFilesHint') }}</p>
      <div class="settings__import-actions">
        <button type="submit" class="primary" :disabled="busy || !chosenFiles.length">{{ t('settings.useProfile') }}</button>
        <button type="button" class="link" @click="openingFiles = false">{{ t('settings.cancel') }}</button>
      </div>
      <ul v-if="fileErrors.length" class="settings__errors" role="alert">
        <li v-for="e in fileErrors" :key="e">{{ e }}</li>
      </ul>
    </form>
    <form v-if="importing" class="settings__import" @submit.prevent="importProfile">
      <label class="settings__field">
        <span>{{ t('settings.fdpUrl') }}</span>
        <input v-model="fdpUrl" type="url" required spellcheck="false" placeholder="https://home.fairdatapoint.org" />
      </label>
      <div class="settings__import-actions">
        <button type="submit" class="primary" :disabled="busy">{{ busy ? t('settings.importing') : t('settings.importProfile') }}</button>
        <button type="button" class="link" @click="importing = false">{{ t('settings.cancel') }}</button>
      </div>
      <p v-if="importError" class="settings__error" role="alert">{{ importError }}</p>
    </form>
    <fieldset v-if="optionalTypes.length > 1" class="settings__types">
      <legend>{{ t('settings.typesInUse') }}</legend>
      <label v-for="ty in optionalTypes" :key="ty.key" class="settings__check" :title="hasRecords(ty.key) ? t('settings.typeHasRecords') : ''">
        <input type="checkbox" :checked="state.typeInUse(ty.key)" :disabled="hasRecords(ty.key)" @change="state.setTypeInUse(ty.key, ($event.target as HTMLInputElement).checked)" />
        {{ ty.name }}
      </label>
    </fieldset>
    <label class="settings__field">
      <span>{{ t('settings.baseUri') }}</span>
      <input v-model="base" type="url" spellcheck="false" @change="state.setBase(base)" @keyup.enter="state.setBase(base)" />
    </label>
    <div class="settings__mode">
      <span>{{ t(MODE_TEXT[state.detectedMode.value]) }}</span>
      <span v-if="state.detectedMode.value === 'ask'" class="settings__choice">
        <label><input type="radio" :checked="p.iriMode === 'file'" @change="state.setMode('file')" /> file</label>
        <label><input type="radio" :checked="p.iriMode === 'redirect'" @change="state.setMode('redirect')" /> redirect</label>
      </span>
    </div>
    <label v-if="p.iriMode === 'redirect'" class="settings__field">
      <span>{{ t('settings.storageBase') }}</span>
      <input v-model="p.storageBase" type="url" spellcheck="false" placeholder="https://owner.github.io/repo/" />
    </label>
    <label class="settings__field">
      <span>{{ t('settings.folder') }}</span>
      <input
        :value="p.folder ?? ''"
        spellcheck="false"
        :placeholder="t('settings.folderPlaceholder')"
        @change="p.folder = ($event.target as HTMLInputElement).value.trim() || undefined"
      />
    </label>
    <label class="settings__check">
      <input type="checkbox" :checked="!!p.index" @change="toggleIndex(($event.target as HTMLInputElement).checked)" />
      {{ t('settings.ping') }}
    </label>
    <div v-if="p.index" class="settings__row">
      <label class="settings__field">
        <span>{{ t('settings.indexUrl') }}</span>
        <input v-model.trim="p.index.url" type="url" spellcheck="false" />
      </label>
      <label class="settings__field">
        <span>{{ t('settings.pagesWorkflow') }}</span>
        <input v-model.trim="p.index.pagesWorkflow" spellcheck="false" />
      </label>
    </div>
    <button v-if="!copying" type="button" class="link settings__copy-toggle" @click="copying = true">{{ t('settings.copyFromUrl') }}</button>
    <form v-else class="settings__import" @submit.prevent="copyFdp">
      <label class="settings__field">
        <span>{{ t('settings.copyUrl') }}</span>
        <input v-model="copyUrl" type="url" required spellcheck="false" placeholder="https://w3id.org/my-org/fdp" />
      </label>
      <p class="settings__hint">{{ t('settings.copyHint') }}</p>
      <div class="settings__import-actions">
        <button type="submit" class="primary" :disabled="busy || state.settingsErrors.value.length > 0">{{ busy ? t('settings.copying') : t('settings.copy') }}</button>
        <button type="button" class="link" @click="copying = false">{{ t('settings.cancel') }}</button>
      </div>
      <p v-if="copyError" class="settings__error" role="alert">{{ copyError }}</p>
    </form>
    <ul v-if="copyReport.length" class="settings__report">
      <li v-for="r in copyReport" :key="r">{{ r }}</li>
    </ul>
    <ul v-if="state.settingsErrors.value.length" class="settings__errors">
      <li v-for="e in state.settingsErrors.value" :key="e">{{ e }}</li>
    </ul>
  </section>
</template>

<style scoped>
.settings {
  display: grid;
  gap: 8px;
}
.settings__field {
  display: grid;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-dark);
}
.settings__field input,
.settings__field select {
  font: inherit;
  font-family: var(--font-mono);
  font-weight: 400;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-input);
}
.settings__check {
  font-size: 0.85rem;
  display: flex;
  gap: 6px;
  align-items: center;
}
.settings__types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.settings__types legend {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0 4px;
}
.settings__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.settings__mode {
  font-size: 0.8rem;
  color: var(--color-text-lighter);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.settings__choice {
  display: inline-flex;
  gap: 12px;
  color: var(--color-text-default);
}
.settings__import {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.settings__import-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.link.settings__copy-toggle {
  justify-self: start;
  font-size: 0.85rem;
  padding: 0;
}
.settings__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-lighter);
}
.settings__report {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  color: var(--color-text-lighter);
}
.settings__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}
.primary {
  font: inherit;
  font-weight: 600;
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.link {
  font: inherit;
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0 4px;
}
.settings__errors {
  margin: 0;
  padding-left: 18px;
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
