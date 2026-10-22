<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { normalizeRecord, type RecordNode } from '@fairdatateam/record-core/record';
import icon from './assets/fdplight-icon.svg';
import EntityForm from './components/EntityForm.vue';
import { entityForm, userGraphFromForm } from './core/forms';
import { iriOf, stamp, type Entity, type Project } from './core/project';
import { serializeEntity, toTurtle } from './core/wiring';
import { FDP_DEFAULT } from './profiles/fdp-default';

// A sample project with one entity per type, to show what FDPlight writes.
// The project wizard and the tree editor replace this in later phases.
const now = new Date();
const entities: Entity[] = [
  { type: 'fdp', id: '', parent: null },
  { type: 'catalog', id: 'example', parent: 'fdp.ttl' },
  { type: 'dataset', id: 'example', parent: 'catalog/example.ttl' },
  { type: 'distribution', id: 'example', parent: 'dataset/example.ttl' },
].map((e) => stamp(e, now));

const project: Project = {
  fdplight: '0.1',
  name: 'Example',
  base: 'https://example.github.io/my-fdp/',
  iriMode: 'file',
  storageBase: null,
  defaults: {
    language: 'http://id.loc.gov/vocabulary/iso639-1/en',
    license: null,
    accessRightsDescription: null,
    metrics: [],
  },
  types: FDP_DEFAULT.types,
  entities,
};

const forms = Object.fromEntries(project.types.map((t) => [t.key, entityForm(t, FDP_DEFAULT.shapes[t.key])]));
const values = reactive<Record<string, RecordNode>>(
  Object.fromEntries(project.types.map((t) => [t.key, normalizeRecord(forms[t.key], {})])),
);

const selected = ref(project.types[0].key);
const entity = computed(() => entities.find((e) => e.type === selected.value)!);
const iri = computed(() => iriOf(project, entity.value));

const turtle = ref('');
watch(
  [selected, () => values[selected.value]],
  async () => {
    const user = userGraphFromForm(forms[selected.value], iri.value, values[selected.value]);
    turtle.value = await toTurtle(serializeEntity(project, entity.value, user), iri.value);
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <header class="header">
    <img :src="icon" alt="" class="logo" width="40" height="40" />
    <div>
      <h1 class="name">FDPlight</h1>
      <p class="tagline">a serverless FAIR Data Point</p>
    </div>
  </header>
  <main class="main">
    <p class="intro">
      Work in progress. Fill in a form generated from the FDP default schemas and see the Turtle
      file FDPlight would publish for it, with all the FAIR Data Point wiring added.
    </p>
    <nav class="tabs" aria-label="Entity type">
      <button
        v-for="t in project.types"
        :key="t.key"
        type="button"
        class="tab"
        :class="{ 'is-active': t.key === selected }"
        :aria-pressed="t.key === selected"
        @click="selected = t.key"
      >
        {{ t.name }}
      </button>
    </nav>
    <div class="columns">
      <section class="card" aria-label="Form">
        <EntityForm :key="selected" :schema="forms[selected]" :values="values[selected]" />
      </section>
      <section class="card" aria-label="Generated Turtle">
        <h2 class="file">{{ iri }}</h2>
        <pre class="turtle">{{ turtle }}</pre>
      </section>
    </div>
  </main>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px;
  background: var(--color-surface-card);
  border-bottom: 1px solid var(--color-border);
}
.logo {
  display: block;
}
.name {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--color-primary);
}
.tagline {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-lighter);
}
.main {
  max-width: 1400px;
  margin: 24px auto;
  padding: 0 16px;
}
.intro {
  margin: 0 0 16px;
  color: var(--color-text-lighter);
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  font: inherit;
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-card);
  color: var(--color-text-default);
  cursor: pointer;
}
.tab.is-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
.card {
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: 16px 20px;
  min-width: 0;
}
.file {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--color-accent);
  overflow-wrap: anywhere;
}
.turtle {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-text-default);
}
</style>
