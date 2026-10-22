<script setup lang="ts">
// Base URI, IRI mode and storage base (SPEC §2.1 to 2.4).
import { ref, watch } from 'vue';
import { recordHasContent } from '@fairdatateam/record-core/record';
import type { ProjectState } from '../composables/useProject';
import type { IriMode } from '../core/iri';
import { BRANCH_PAGES_WORKFLOW } from '../core/ping';
import { PROFILES } from '../profiles';

const props = defineProps<{ state: ProjectState }>();
const p = props.state.project;

function chooseProfile(e: Event) {
  const select = e.target as HTMLSelectElement;
  const hasContent = p.entities.length > 1 || Object.values(props.state.values).some(recordHasContent);
  if (hasContent && !window.confirm('Switching the profile starts a new, empty project. Continue?')) {
    select.value = props.state.profile.value;
    return;
  }
  props.state.switchProfile(select.value);
}

function toggleIndex(on: boolean) {
  p.index = on ? { url: 'https://home.fairdatapoint.org', pagesWorkflow: BRANCH_PAGES_WORKFLOW } : undefined;
}

const base = ref(p.base);
watch(() => p.base, (b) => (base.value = b));

const MODE_TEXT: Record<IriMode | 'ask', string> = {
  file: 'File mode: the IRIs are the .ttl file URLs.',
  redirect: 'Redirect mode: extensionless IRIs that redirect to the files at the storage base.',
  ask: 'FDPlight cannot tell how this host serves files. Choose a mode.',
};
</script>

<template>
  <section class="settings" aria-label="Project settings">
    <label class="settings__field">
      <span>Profile</span>
      <select :value="state.profile.value" @change="chooseProfile">
        <option v-for="(prof, key) in PROFILES" :key="key" :value="key">{{ prof.name }}</option>
      </select>
    </label>
    <label class="settings__field">
      <span>Base URI</span>
      <input v-model="base" type="url" spellcheck="false" @change="state.setBase(base)" @keyup.enter="state.setBase(base)" />
    </label>
    <div class="settings__mode">
      <span>{{ MODE_TEXT[state.detectedMode.value] }}</span>
      <span v-if="state.detectedMode.value === 'ask'" class="settings__choice">
        <label><input type="radio" :checked="p.iriMode === 'file'" @change="state.setMode('file')" /> file</label>
        <label><input type="radio" :checked="p.iriMode === 'redirect'" @change="state.setMode('redirect')" /> redirect</label>
      </span>
    </div>
    <label v-if="p.iriMode === 'redirect'" class="settings__field">
      <span>Storage base (where the .ttl files are served)</span>
      <input v-model="p.storageBase" type="url" spellcheck="false" placeholder="https://owner.github.io/repo/" />
    </label>
    <label class="settings__field">
      <span>Folder in the repository (empty for the root, or e.g. metadata/)</span>
      <input
        :value="p.folder ?? ''"
        spellcheck="false"
        placeholder="(repository root)"
        @change="p.folder = ($event.target as HTMLInputElement).value.trim() || undefined"
      />
    </label>
    <label class="settings__check">
      <input type="checkbox" :checked="!!p.index" @change="toggleIndex(($event.target as HTMLInputElement).checked)" />
      Ping an FDP Index after each Pages deployment (writes .github/workflows/fdp-ping.yml)
    </label>
    <div v-if="p.index" class="settings__row">
      <label class="settings__field">
        <span>Index URL</span>
        <input v-model.trim="p.index.url" type="url" spellcheck="false" />
      </label>
      <label class="settings__field">
        <span>Pages workflow name</span>
        <input v-model.trim="p.index.pagesWorkflow" spellcheck="false" />
      </label>
    </div>
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
.settings__errors {
  margin: 0;
  padding-left: 18px;
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
