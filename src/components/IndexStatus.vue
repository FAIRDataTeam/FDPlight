<script setup lang="ts">
// The project's state in its FDP Index (TASKS Phase 7), read-only.
import { ref } from 'vue';
import type { ProjectState } from '../composables/useProject';
import { fetchIndexStatus, type IndexStatus } from '../core/indexStatus';
import { iriOf, rootOf } from '../core/project';

const props = defineProps<{ state: ProjectState }>();
const status = ref<IndexStatus | null>(null);
const error = ref('');
const busy = ref(false);

async function check() {
  const p = props.state.project;
  const root = rootOf(p);
  if (!p.index || !root) return;
  busy.value = true;
  error.value = '';
  try {
    status.value = await fetchIndexStatus(p.index.url, iriOf(p, root), p.entities.map((e) => iriOf(p, e)));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : '');
</script>

<template>
  <section v-if="state.project.index" class="index" aria-label="Index status">
    <button type="button" class="index__check" :disabled="busy || state.settingsErrors.value.length > 0" @click="check">
      {{ busy ? 'Checking…' : 'Check the Index' }}
    </button>
    <template v-if="status">
      <p v-if="!status.entry">Not in {{ state.project.index.url }} yet: it is added at the first ping.</p>
      <template v-else>
        <p>
          <span class="index__state" :class="`is-${status.entry.state.toLowerCase()}`">{{ status.entry.state }}</span>
          last updated {{ when(status.entry.modificationTime) }}.
          {{ status.harvested.length }} of {{ state.project.entities.length }} entities harvested
          (<a :href="status.dataUrl!" target="_blank" rel="noopener">data</a>).
        </p>
        <ul v-if="status.missing.length" class="index__missing">
          <li v-for="m in status.missing" :key="m">Not harvested: {{ m }}</li>
        </ul>
      </template>
    </template>
    <p v-if="error" class="index__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.index {
  font-size: 0.85rem;
  display: grid;
  gap: 6px;
  margin-top: 6px;
}
.index p {
  margin: 0;
}
.index a {
  color: var(--color-accent);
}
.index__check {
  justify-self: start;
  font: inherit;
  padding: 4px 12px;
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.index__check:disabled {
  opacity: 0.5;
}
.index__state {
  font-weight: 600;
}
.index__state.is-active {
  color: var(--color-success);
}
.index__state.is-inactive,
.index__state.is-unreachable,
.index__state.is-invalid {
  color: var(--color-danger);
}
.index__missing {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-lighter);
}
.index__error {
  color: var(--color-danger);
}
</style>
