<script setup lang="ts">
// Optional guided setup for a new project (TASKS Phase 1, decided
// 2026-10-23): repository and base URI, profile, Index ping. Nothing changes
// until Finish; every step also stays in the settings and the connect form.
import { computed, nextTick, onMounted, ref } from 'vue';
import type { ProjectState } from '../composables/useProject';
import type { usePublish } from '../composables/usePublish';
import { useI18n } from '../composables/useI18n';
import { pagesBase } from '../core/iri';
import { BRANCH_PAGES_WORKFLOW } from '../core/ping';
import { PROFILES } from '../profiles';

const props = defineProps<{ state: ProjectState; pub: ReturnType<typeof usePublish> }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const p = props.state.project;

const STEPS = 4;
const step = ref(1);

// Step 1: where the FDP lives.
const owner = ref(props.pub.repo.value.owner);
const repo = ref(props.pub.repo.value.repo);
const branch = ref(props.pub.repo.value.branch || 'main');
const folder = ref(p.folder ?? '');
const customDomain = ref(false);
const domain = ref('');
const normalFolder = computed(() => {
  const f = folder.value.trim().replace(/^\/+/, '');
  return f && !f.endsWith('/') ? `${f}/` : f;
});
const base = computed(() => {
  if (customDomain.value) {
    const host = domain.value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return host ? `https://${host}/${normalFolder.value}` : '';
  }
  return owner.value.trim() && repo.value.trim() ? pagesBase(owner.value.trim(), repo.value.trim()) + normalFolder.value : '';
});

// Step 2: the profile (bundled; importing or opening files stays in the settings).
const profile = ref(props.state.profile.value in PROFILES ? props.state.profile.value : 'fdp-default');
const PROFILE_TEXT: Record<string, string> = {
  'fdp-default': 'wizard.profileDefault',
  software: 'wizard.profileSoftware',
  erdera: 'wizard.profileErdera',
};

// Step 3: pinging an Index.
const ping = ref(!!p.index);
const indexUrl = ref(p.index?.url ?? 'https://home.fairdatapoint.org');
const pagesWorkflow = ref(p.index?.pagesWorkflow ?? BRANCH_PAGES_WORKFLOW);

const canNext = computed(() => (step.value === 1 ? !!base.value && !!branch.value.trim() : true));

function finish(): void {
  if (profile.value !== props.state.profile.value) {
    if (props.state.hasLocalWork() && !window.confirm(t('settings.switchConfirm'))) return;
    props.state.switchProfile(profile.value);
  }
  p.folder = normalFolder.value || undefined;
  props.state.setBase(base.value);
  if (customDomain.value) props.state.setMode('file'); // a Pages custom domain serves the files as they are (SPEC §2.2)
  p.index = ping.value ? { url: indexUrl.value.trim(), pagesWorkflow: pagesWorkflow.value.trim() } : undefined;
  if (!props.pub.connected.value) props.pub.repo.value = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() };
  emit('close');
}

const dialog = ref<HTMLElement | null>(null);
async function focusFirst(): Promise<void> {
  await nextTick();
  dialog.value?.querySelector<HTMLElement>('input, select, button.primary')?.focus();
}
onMounted(focusFirst);
function go(n: number): void {
  step.value = n;
  focusFirst();
}
</script>

<template>
  <div class="wizard__backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="wizard"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      @keydown.esc="emit('close')"
    >
      <div class="wizard__head">
        <h2 id="wizard-title">{{ t('wizard.title') }}</h2>
        <span class="wizard__step">{{ t('wizard.stepOf', { n: step, total: STEPS }) }}</span>
      </div>

      <div v-if="step === 1" class="wizard__body">
        <h3>{{ t('wizard.whereTitle') }}</h3>
        <p class="wizard__hint">{{ t('wizard.whereHint') }}</p>
        <div class="wizard__row">
          <label><span>{{ t('publish.owner') }}</span><input v-model.trim="owner" spellcheck="false" placeholder="erdera" /></label>
          <label><span>{{ t('publish.repository') }}</span><input v-model.trim="repo" spellcheck="false" placeholder="my-fdp" /></label>
          <label class="wizard__narrow"><span>{{ t('publish.branch') }}</span><input v-model.trim="branch" spellcheck="false" /></label>
        </div>
        <label><span>{{ t('settings.folder') }}</span><input v-model="folder" spellcheck="false" :placeholder="t('settings.folderPlaceholder')" /></label>
        <label class="wizard__check"><input v-model="customDomain" type="checkbox" /> {{ t('wizard.customDomain') }}</label>
        <label v-if="customDomain"><span>{{ t('wizard.domain') }}</span><input v-model="domain" spellcheck="false" placeholder="fdp.example.org" /></label>
        <p class="wizard__base">
          {{ t('settings.baseUri') }}: <code>{{ base || '…' }}</code>
        </p>
        <p class="wizard__hint">{{ t('wizard.baseHint') }}</p>
      </div>

      <div v-else-if="step === 2" class="wizard__body">
        <h3>{{ t('wizard.profileTitle') }}</h3>
        <label v-for="(prof, key) in PROFILES" :key="key" class="wizard__choice">
          <input v-model="profile" type="radio" :value="key" />
          <span><strong>{{ prof.name }}</strong> — {{ t(PROFILE_TEXT[key] ?? '') }}</span>
        </label>
        <p class="wizard__hint">{{ t('wizard.profileHint') }}</p>
      </div>

      <div v-else-if="step === 3" class="wizard__body">
        <h3>{{ t('wizard.pingTitle') }}</h3>
        <p class="wizard__hint">{{ t('wizard.pingHint') }}</p>
        <label class="wizard__check"><input v-model="ping" type="checkbox" /> {{ t('settings.ping') }}</label>
        <template v-if="ping">
          <label><span>{{ t('settings.indexUrl') }}</span><input v-model="indexUrl" type="url" spellcheck="false" /></label>
          <label><span>{{ t('settings.pagesWorkflow') }}</span><input v-model="pagesWorkflow" spellcheck="false" /></label>
        </template>
      </div>

      <div v-else class="wizard__body">
        <h3>{{ t('wizard.doneTitle') }}</h3>
        <ul class="wizard__summary">
          <li>{{ t('wizard.summaryRepo', { repo: `${owner}/${repo}`, branch }) }}</li>
          <li>{{ t('settings.baseUri') }}: <code>{{ base }}</code></li>
          <li>{{ t('settings.profile') }}: {{ PROFILES[profile]?.name }}</li>
          <li>{{ ping ? t('wizard.summaryPing', { url: indexUrl }) : t('wizard.summaryNoPing') }}</li>
        </ul>
        <p class="wizard__hint">{{ t('wizard.next') }}</p>
      </div>

      <div class="wizard__actions">
        <button type="button" class="link" @click="emit('close')">{{ t('wizard.skip') }}</button>
        <span class="wizard__spacer" />
        <button v-if="step > 1" type="button" class="secondary" @click="go(step - 1)">{{ t('wizard.back') }}</button>
        <button v-if="step < STEPS" type="button" class="primary" :disabled="!canNext" @click="go(step + 1)">{{ t('wizard.nextStep') }}</button>
        <button v-else type="button" class="primary" @click="finish">{{ t('wizard.finish') }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wizard__backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(27, 42, 74, 0.35);
}
.wizard {
  width: min(640px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: var(--color-surface-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 32, 60, 0.2);
  padding: 18px 22px;
}
.wizard__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.wizard__head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--color-primary);
}
.wizard__step {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--color-text-lighter);
}
.wizard__body {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}
.wizard__body h3 {
  margin: 0;
  font-size: 1rem;
}
.wizard__body label:not(.wizard__check):not(.wizard__choice) {
  display: grid;
  min-width: 0;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}
.wizard__body input:not([type='checkbox']):not([type='radio']) {
  width: 100%;
  min-width: 0;
  font: inherit;
  font-family: var(--font-mono);
  font-weight: 400;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.wizard__row {
  display: grid;
  min-width: 0;
  grid-template-columns: 1fr 1fr 8rem;
  gap: 8px;
}
@media (max-width: 560px) {
  .wizard__row {
    grid-template-columns: 1fr;
  }
}
.wizard__check,
.wizard__choice {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.9rem;
}
.wizard__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-lighter);
}
.wizard__base {
  margin: 0;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.wizard__summary {
  margin: 0;
  padding-left: 18px;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
.wizard__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wizard__spacer {
  flex: 1;
}
.primary,
.secondary {
  font: inherit;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
}
.primary {
  border: none;
  background: var(--color-primary);
  color: #fff;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.secondary {
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-default);
}
.link {
  font: inherit;
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
}
</style>
