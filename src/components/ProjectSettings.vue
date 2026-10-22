<script setup lang="ts">
// Base URI, IRI mode and storage base (SPEC §2.1 to 2.4).
import { ref, watch } from 'vue';
import type { ProjectState } from '../composables/useProject';
import type { IriMode } from '../core/iri';

const props = defineProps<{ state: ProjectState }>();
const p = props.state.project;

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
.settings__field input {
  font: inherit;
  font-family: var(--font-mono);
  font-weight: 400;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-input);
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
