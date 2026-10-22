<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import icon from './assets/fdplight-icon.svg';
import EntityForm from './components/EntityForm.vue';
import EntityTree from './components/EntityTree.vue';
import IndexStatus from './components/IndexStatus.vue';
import ProjectSettings from './components/ProjectSettings.vue';
import PublishPanel from './components/PublishPanel.vue';
import { usePublish } from './composables/usePublish';
import { useProject } from './composables/useProject';
import { iriOf } from './core/project';
import { treeKeyTarget } from './core/tree';

const state = useProject();
const pub = usePublish(state);
const { project, selected, entity } = state;

const isRoot = computed(() => entity.value.parent === null);
const iri = computed(() => (state.settingsErrors.value.length ? '' : iriOf(project, entity.value)));
const type = computed(() => state.typeOf(entity.value));

// The id field edits a draft; the rename happens on change / Enter.
const idDraft = ref(entity.value.id);
watch(entity, (e) => (idDraft.value = e.id));

// Arrow keys, Home and End move through the tree (TASKS Phase 8). Only the
// selected node is in the Tab order.
const treeNav = ref<HTMLElement | null>(null);
async function onTreeKey(ev: KeyboardEvent) {
  const from = (ev.target as HTMLElement).closest<HTMLElement>('.tree__node')?.dataset.path;
  if (!from) return;
  const to = treeKeyTarget(project, state.root.value, from, ev.key);
  if (ev.key.startsWith('Arrow') || ev.key === 'Home' || ev.key === 'End') ev.preventDefault();
  if (!to) return;
  selected.value = to;
  await nextTick();
  treeNav.value?.querySelector<HTMLElement>(`.tree__node[data-path="${CSS.escape(to)}"]`)?.focus();
}

// Other places the selected entity may move to (its current parent excluded).
const moveTo = computed(() => (isRoot.value ? [] : state.moveOptions(selected.value).filter((o) => o.path !== entity.value.parent)));

function moveSelected(ev: Event) {
  const select = ev.target as HTMLSelectElement;
  if (select.value) state.move(selected.value, select.value);
  select.value = '';
}

function removeSelected() {
  const below = project.entities.filter((e) => e.parent === selected.value).length;
  const what = below ? ' and everything below it' : '';
  if (window.confirm(`Delete this ${type.value.name.toLowerCase()}${what}?`)) state.remove(selected.value);
}
</script>

<template>
  <header class="header">
    <img :src="icon" alt="" class="logo" width="40" height="40" />
    <div>
      <h1 class="name">FDPlight</h1>
      <p class="tagline">a serverless FAIR Data Point</p>
    </div>
    <p class="wip">Work in progress: pilot version.</p>
  </header>

  <main class="main">
    <div class="top">
      <section class="card">
        <ProjectSettings :state="state" />
        <IndexStatus :state="state" />
      </section>
      <section class="card">
        <PublishPanel :pub="pub" />
      </section>
    </div>

    <div class="columns">
      <nav ref="treeNav" class="card tree" aria-label="Entities (arrow keys move between entities)" @keydown="onTreeKey">
        <ul class="tree__root">
          <EntityTree :state="state" :path="state.root.value" />
        </ul>
      </nav>

      <section class="card" aria-label="Metadata">
        <div class="entity">
          <div class="entity__type">{{ type.name }}</div>
          <div class="entity__file">{{ selected }}</div>
          <div v-if="!isRoot" class="entity__actions">
            <label class="entity__id">
              <span>Id</span>
              <input
                v-model="idDraft"
                spellcheck="false"
                :disabled="state.published.value.has(selected)"
                :title="state.published.value.has(selected) ? 'Published: the id is part of the IRI' : ''"
                @change="state.rename(selected, idDraft)"
                @keyup.enter="state.rename(selected, idDraft)"
              />
            </label>
            <label v-if="moveTo.length" class="entity__move">
              <span>Move to</span>
              <select @change="moveSelected">
                <option value="">…</option>
                <option v-for="o in moveTo" :key="o.path" :value="o.path">{{ o.label }}</option>
              </select>
            </label>
            <button type="button" class="danger" @click="removeSelected">Delete</button>
          </div>
          <p v-if="state.lastError.value" class="error" role="alert">{{ state.lastError.value }}</p>
        </div>
        <EntityForm
          :key="selected"
          :schema="state.forms[entity.type]"
          :values="state.values[selected]"
          :findings="state.findings.value.get(selected)"
        />
      </section>

      <section class="card" aria-label="Generated file">
        <div class="checks" :class="{ 'is-ok': !state.issues.value.length && !state.totalErrors.value }">
          <div v-if="state.totalErrors.value" class="checks__shacl">
            {{ state.totalErrors.value }} {{ state.totalErrors.value === 1 ? 'problem' : 'problems' }} to fix in the
            metadata (see the red counts in the tree)
          </div>
          <div v-else-if="!state.checking.value" class="checks__shacl">Metadata complete</div>
          <template v-if="!state.issues.value.length">Structure OK</template>
          <ul v-else>
            <li v-for="(i, n) in state.issues.value" :key="n" :class="`is-${i.severity}`">
              <strong v-if="i.entity">{{ i.entity }}:</strong> {{ i.message }}
            </li>
          </ul>
        </div>
        <h2 class="file">{{ iri }}</h2>
        <pre class="turtle">{{ state.turtle.value }}</pre>
      </section>
    </div>
  </main>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
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
.wip {
  margin: 0 0 0 auto;
  font-size: 0.8rem;
  color: var(--color-text-lighter);
}
.main {
  max-width: 1600px;
  margin: 16px auto;
  padding: 0 16px;
  display: grid;
  gap: 16px;
}
.top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .top {
    grid-template-columns: minmax(0, 1fr);
  }
}
.columns {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
.card {
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: 14px 18px;
  min-width: 0;
}
.tree__root {
  margin: 0;
  padding: 0;
}
.entity {
  margin-bottom: 10px;
}
.entity__type {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-lighter);
}
.entity__file {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--color-primary);
  overflow-wrap: anywhere;
}
.entity__actions {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 8px;
}
.entity__id,
.entity__move {
  display: grid;
  gap: 2px;
  font-size: 0.8rem;
  font-weight: 600;
}
.entity__id input {
  font: inherit;
  font-family: var(--font-mono);
  font-weight: 400;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.entity__move select {
  font: inherit;
  font-weight: 400;
  max-width: 16rem;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-card);
}
.danger {
  font: inherit;
  font-size: 0.85rem;
  padding: 5px 12px;
  border: 1px solid var(--color-danger);
  border-radius: 6px;
  background: none;
  color: var(--color-danger);
  cursor: pointer;
}
.error {
  margin: 6px 0 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}
.checks {
  font-size: 0.85rem;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-primary-tint);
}
.checks.is-ok {
  color: var(--color-success);
}
.checks ul {
  margin: 0;
  padding-left: 18px;
}
.checks .is-error {
  color: var(--color-danger);
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
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-text-default);
}
</style>
