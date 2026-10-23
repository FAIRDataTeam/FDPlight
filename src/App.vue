<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import icon from './assets/fdplight-icon.svg';
import EntityForm from './components/EntityForm.vue';
import EntityTree from './components/EntityTree.vue';
import IndexStatus from './components/IndexStatus.vue';
import ProjectSettings from './components/ProjectSettings.vue';
import PublishPanel from './components/PublishPanel.vue';
import SetupWizard from './components/SetupWizard.vue';
import { useI18n } from './composables/useI18n';
import { usePublish } from './composables/usePublish';
import { LOCALES } from './i18n';
import { useProject } from './composables/useProject';
import { iriOf } from './core/project';
import { treeKeyTarget } from './core/tree';

const state = useProject();
const pub = usePublish(state);
const { project, selected, entity } = state;
const { t, plural, tc, locale, setLocale } = useI18n();
const GUIDE_URL = 'https://github.com/FAIRDataTeam/FDPlight/blob/main/docs/data-steward-guide.md';
// The page's language follows the chosen locale (screen readers, hyphenation).
watch(locale, (l) => (document.documentElement.lang = l), { immediate: true });

const isRoot = computed(() => entity.value.parent === null);
const iri = computed(() => (state.settingsErrors.value.length ? '' : iriOf(project, entity.value)));
const type = computed(() => state.typeOf(entity.value));

// The optional guided setup (TASKS Phase 1): offered once on a first visit,
// always available from the header.
const SETUP_KEY = 'fdplight.setup.offered';
function setupOffered(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === '1';
  } catch {
    return false;
  }
}
const offerSetup = ref(!setupOffered() && !state.hasLocalWork());
const wizardOpen = ref(false);
let opener: HTMLElement | null = null;
function dismissOffer(): void {
  offerSetup.value = false;
  try {
    localStorage.setItem(SETUP_KEY, '1');
  } catch {
    /* storage unavailable: offered again next time */
  }
}
function openWizard(): void {
  opener = document.activeElement as HTMLElement | null;
  dismissOffer();
  wizardOpen.value = true;
}
function closeWizard(): void {
  wizardOpen.value = false;
  nextTick(() => opener?.focus());
}

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
  const question = t(below ? 'app.deleteConfirmBelow' : 'app.deleteConfirm', { type: type.value.name.toLowerCase() });
  if (window.confirm(question)) state.remove(selected.value);
}
</script>

<template>
  <header class="header">
    <img :src="icon" alt="" class="logo" width="40" height="40" />
    <div>
      <h1 class="name">FDPlight</h1>
      <p class="tagline">{{ t('app.tagline') }}</p>
    </div>
    <p class="wip">{{ t('app.wip') }}</p>
    <button type="button" class="guide setup-link" @click="openWizard">{{ t('wizard.open') }}</button>
    <a class="guide" :href="GUIDE_URL" target="_blank" rel="noopener" :title="t('app.guideTitle')">{{ t('app.guide') }}</a>
    <label class="lang">
      <select :value="locale" :aria-label="t('app.language')" @change="setLocale(($event.target as HTMLSelectElement).value as never)">
        <option v-for="l in LOCALES" :key="l.code" :value="l.code">{{ l.label }}</option>
      </select>
    </label>
  </header>

  <main class="main">
    <section v-if="offerSetup" class="card offer" :aria-label="t('wizard.title')">
      <p>{{ t('wizard.offer') }}</p>
      <button type="button" class="offer__start" @click="openWizard">{{ t('wizard.start') }}</button>
      <button type="button" class="offer__dismiss" @click="dismissOffer">{{ t('wizard.noThanks') }}</button>
    </section>
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
      <nav ref="treeNav" class="card tree" :aria-label="t('app.entities')" @keydown="onTreeKey">
        <ul class="tree__root">
          <EntityTree :state="state" :path="state.root.value" />
        </ul>
      </nav>

      <section class="card" :aria-label="t('app.metadata')">
        <div class="entity">
          <div class="entity__type">{{ type.name }}</div>
          <div class="entity__file">{{ selected }}</div>
          <div v-if="!isRoot" class="entity__actions">
            <label class="entity__id">
              <span>{{ t('app.id') }}</span>
              <input
                v-model="idDraft"
                spellcheck="false"
                :disabled="state.published.value.has(selected)"
                :title="state.published.value.has(selected) ? t('app.idLocked') : ''"
                @change="state.rename(selected, idDraft)"
                @keyup.enter="state.rename(selected, idDraft)"
              />
            </label>
            <label v-if="moveTo.length" class="entity__move">
              <span>{{ t('app.moveTo') }}</span>
              <select @change="moveSelected">
                <option value="">…</option>
                <option v-for="o in moveTo" :key="o.path" :value="o.path">{{ o.label }}</option>
              </select>
            </label>
            <button type="button" class="danger" @click="removeSelected">{{ t('app.delete') }}</button>
          </div>
          <p v-if="state.lastError.value" class="error" role="alert">{{ tc(state.lastError.value) }}</p>
        </div>
        <p v-if="state.hiddenFromVp.value" class="vp-hidden" role="status">{{ t('app.vpHidden') }}</p>
        <EntityForm
          :key="selected"
          :schema="state.forms[entity.type]"
          :values="state.values[selected]"
          :findings="state.findings.value.get(selected)"
        />
      </section>

      <section class="card" :aria-label="t('app.generatedFile')">
        <div class="checks" :class="{ 'is-ok': !state.issues.value.length && !state.totalErrors.value }">
          <div v-if="state.totalErrors.value" class="checks__shacl">
            {{ plural('app.problems', state.totalErrors.value) }}
          </div>
          <div v-else-if="!state.checking.value" class="checks__shacl">{{ t('app.metadataComplete') }}</div>
          <template v-if="!state.issues.value.length">{{ t('app.structureOk') }}</template>
          <ul v-else>
            <li v-for="(i, n) in state.issues.value" :key="n" :class="`is-${i.severity}`">
              <strong v-if="i.entity">{{ i.entity }}:</strong> {{ tc(i.message) }}
            </li>
          </ul>
        </div>
        <h2 class="file">{{ iri }}</h2>
        <pre class="turtle">{{ state.turtle.value }}</pre>
      </section>
    </div>
  </main>
  <SetupWizard v-if="wizardOpen" :state="state" :pub="pub" @close="closeWizard" />
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
.guide {
  font-size: 0.85rem;
  color: var(--color-accent);
}
.setup-link {
  font: inherit;
  font-size: 0.85rem;
  border: none;
  background: none;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.offer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}
.offer p {
  margin: 0;
  flex: 1 1 20rem;
  font-size: 0.9rem;
}
.offer__start {
  font: inherit;
  font-weight: 600;
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
}
.offer__dismiss {
  font: inherit;
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.lang select {
  font: inherit;
  font-size: 0.8rem;
  padding: 3px 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-card);
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
.vp-hidden {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--color-warning);
  border-radius: 6px;
  background: var(--color-warning-tint);
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
