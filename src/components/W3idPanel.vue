<script setup lang="ts">
// w3id rules and the redirect check for redirect mode (SPEC §2.4). FDPlight
// writes the rules; the user submits them to perma-id/w3id.org.
import { computed, reactive, ref, watch } from 'vue';
import type { ProjectState } from '../composables/useProject';
import { useI18n } from '../composables/useI18n';
import { checkRedirect, htaccessRules, W3ID_GUIDE, w3idPath, w3idRulesPath, type RedirectStatus, type W3idContact } from '../core/w3id';

const props = defineProps<{ state: ProjectState }>();
const { t } = useI18n();
const p = props.state.project;

// Contact details for the rules' header: a per-browser convenience, not part of the project.
const CONTACT_KEY = 'fdplight.w3id.contact';
function loadContact(): W3idContact {
  try {
    return JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}') as W3idContact;
  } catch {
    return {};
  }
}
const contact = reactive<W3idContact>({ name: '', email: '', github: '', ...loadContact() });
watch(contact, (c) => {
  try {
    localStorage.setItem(CONTACT_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
});

const path = computed(() => w3idPath(p.base));
const rulesPath = computed(() => w3idRulesPath(p.base));
const ready = computed(() => !!path.value && !!p.storageBase && !props.state.settingsErrors.value.length);
const rules = computed(() => (ready.value ? htaccessRules(p, contact) : ''));
const complete = computed(() => !!(contact.name?.trim() && contact.email?.trim() && contact.github?.trim()));

const copied = ref(false);
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(rules.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    /* clipboard unavailable: the rules can be selected by hand */
  }
}

const status = ref<RedirectStatus | null>(null);
const checking = ref(false);
async function check(): Promise<void> {
  checking.value = true;
  status.value = await checkRedirect(p);
  checking.value = false;
}
</script>

<template>
  <section class="w3id" :aria-label="t('w3id.title')">
    <p v-if="!path" class="w3id__hint">{{ t('w3id.otherHost', { base: p.base, storage: p.storageBase || '…' }) }}</p>
    <p v-else-if="!ready" class="w3id__hint">{{ t('w3id.needStorage') }}</p>
    <template v-else>
      <h2 class="w3id__title">{{ t('w3id.title') }}</h2>
      <p class="w3id__hint">{{ t('w3id.intro', { base: p.base, storage: p.storageBase ?? '' }) }}</p>
      <div class="w3id__contact">
        <label><span>{{ t('w3id.name') }}</span><input v-model="contact.name" autocomplete="name" /></label>
        <label><span>{{ t('w3id.email') }}</span><input v-model="contact.email" type="email" autocomplete="email" /></label>
        <label><span>{{ t('w3id.github') }}</span><input v-model="contact.github" spellcheck="false" /></label>
      </div>
      <p v-if="!complete" class="w3id__hint">{{ t('w3id.contactNeeded') }}</p>
      <pre class="w3id__rules" tabindex="0" :aria-label="rulesPath ?? ''">{{ rules }}</pre>
      <ol class="w3id__steps">
        <li>{{ t('w3id.step1') }}</li>
        <li>{{ t('w3id.step2', { path: rulesPath ?? '' }) }}</li>
        <li>{{ t('w3id.step3') }}</li>
      </ol>
      <div class="w3id__actions">
        <button type="button" class="w3id__button" @click="copy">{{ copied ? t('w3id.copied') : t('w3id.copy') }}</button>
        <a :href="W3ID_GUIDE" target="_blank" rel="noopener">{{ t('w3id.guide') }}</a>
        <button type="button" class="w3id__button" :disabled="checking" @click="check">
          {{ checking ? t('w3id.checking') : t('w3id.check') }}
        </button>
      </div>
      <p v-if="status" class="w3id__status" :class="`is-${status.state}`" role="status">
        <template v-if="status.state === 'elsewhere'">{{ t('w3id.elsewhere', { url: status.url }) }}</template>
        <template v-else>{{ t(`w3id.${status.state}`) }}</template>
      </p>
    </template>
  </section>
</template>

<style scoped>
.w3id {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.w3id__title {
  margin: 0;
  font-size: 0.9rem;
}
.w3id__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-lighter);
}
.w3id__contact {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 700px) {
  .w3id__contact {
    grid-template-columns: minmax(0, 1fr);
  }
}
.w3id__contact label {
  display: grid;
  gap: 2px;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 600;
}
.w3id__contact input {
  min-width: 0;
  font: inherit;
  font-weight: 400;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.w3id__rules {
  margin: 0;
  padding: 8px 10px;
  max-height: 16rem;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  background: var(--color-primary-tint);
  border-radius: 6px;
  white-space: pre;
}
.w3id__steps {
  margin: 0;
  padding-left: 20px;
  font-size: 0.85rem;
}
.w3id__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 0.85rem;
}
.w3id__actions a {
  color: var(--color-accent);
}
.w3id__button {
  font: inherit;
  padding: 4px 12px;
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.w3id__status {
  margin: 0;
  font-size: 0.85rem;
}
.w3id__status.is-ok {
  color: var(--color-success);
}
.w3id__status.is-missing,
.w3id__status.is-elsewhere,
.w3id__status.is-unreachable {
  color: var(--color-warning);
}
</style>
