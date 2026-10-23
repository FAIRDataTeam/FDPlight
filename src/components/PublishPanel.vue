<script setup lang="ts">
// Connect to a GitHub repository and publish the project in one commit
// (TASKS Phase 6, SPEC §7.1).
import { ref } from 'vue';
import type { usePublish } from '../composables/usePublish';
import type { ImportMode } from '../core/import';
import { useI18n } from '../composables/useI18n';

defineProps<{ pub: ReturnType<typeof usePublish> }>();
const { t, plural, tc } = useI18n();
const rootPath = ref('');
const mode = ref<ImportMode>('keep');
</script>

<template>
  <section class="publish" :aria-label="t('publish.title')">
    <h2 class="publish__title">{{ t('publish.title') }}</h2>

    <form v-if="!pub.connected.value" class="publish__connect" @submit.prevent="pub.connect()">
      <div class="publish__row">
        <label>
          <span>{{ t('publish.owner') }}</span>
          <input v-model.trim="pub.repo.value.owner" required spellcheck="false" placeholder="erdera" />
        </label>
        <label>
          <span>{{ t('publish.repository') }}</span>
          <input v-model.trim="pub.repo.value.repo" required spellcheck="false" placeholder="my-fdp" />
        </label>
        <label class="publish__branch">
          <span>{{ t('publish.branch') }}</span>
          <input v-model.trim="pub.repo.value.branch" required spellcheck="false" />
        </label>
      </div>
      <label>
        <span>{{ t('publish.token') }}</span>
        <input v-model.trim="pub.token.value" type="password" required autocomplete="off" />
      </label>
      <p class="publish__hint">
        {{ t('publish.tokenHintBefore') }}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">{{ t('publish.tokenLink') }}</a>
        {{ t('publish.tokenHintAfter') }}
      </p>
      <button type="submit" class="primary" :disabled="pub.busy.value">{{ pub.busy.value ? t('publish.connecting') : t('publish.connect') }}</button>
    </form>

    <div v-else class="publish__connected">
      <p>
        {{ t('publish.connectedTo') }}
        <a :href="`https://github.com/${pub.repo.value.owner}/${pub.repo.value.repo}/tree/${pub.repo.value.branch}`" target="_blank" rel="noopener">
          {{ pub.repo.value.owner }}/{{ pub.repo.value.repo }}
        </a>
        ({{ t('publish.at', { branch: pub.repo.value.branch, sha: pub.head.value.slice(0, 7) }) }})
        <button type="button" class="link" @click="pub.disconnect()">{{ t('publish.disconnect') }}</button>
      </p>

      <form v-if="pub.canImport.value" class="publish__import" @submit.prevent="pub.importExisting(rootPath, mode)">
        <p>{{ t('publish.noProject') }}</p>
        <label>
          <span>{{ t('publish.rootFile') }}</span>
          <input v-model.trim="rootPath" list="fdplight-ttl-files" required spellcheck="false" :placeholder="t('publish.rootFilePlaceholder')" />
          <datalist id="fdplight-ttl-files">
            <option v-for="f in pub.importCandidates.value" :key="f" :value="f" />
          </datalist>
        </label>
        <label class="publish__radio">
          <input v-model="mode" type="radio" value="keep" />
          {{ t('publish.keepIris') }}
        </label>
        <label class="publish__radio">
          <input v-model="mode" type="radio" value="migrate" />
          {{ t('publish.migrateIris') }}
        </label>
        <button type="submit" class="primary" :disabled="pub.busy.value">{{ t('publish.import') }}</button>
      </form>
      <p v-if="pub.loaded.value" class="publish__loaded">{{ t('publish.loaded') }}</p>
      <ul v-if="pub.loadReport.value.length" class="publish__report">
        <li v-for="r in pub.loadReport.value" :key="r">{{ tc(r) }}</li>
      </ul>
      <details v-if="Object.keys(pub.loadCounts.value).length" class="publish__counts">
        <summary>{{ t('publish.countsSummary') }}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t('publish.countsFile') }}</th>
              <th scope="col" :title="t('publish.countsMappedTitle')">{{ t('publish.countsMapped') }}</th>
              <th scope="col" :title="t('publish.countsRegeneratedTitle')">{{ t('publish.countsRegenerated') }}</th>
              <th scope="col" :title="t('publish.countsKeptTitle')">{{ t('publish.countsKept') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, path) in pub.loadCounts.value" :key="path">
              <th scope="row">{{ path }}</th>
              <td>{{ c.mapped }}</td>
              <td>{{ c.regenerated }}</td>
              <td>{{ c.kept }}</td>
            </tr>
          </tbody>
        </table>
      </details>
      <ul v-if="pub.blockers.value.length" class="publish__blockers">
        <li v-for="b in pub.blockers.value" :key="b">{{ b }}</li>
      </ul>

      <template v-if="!pub.plan.value">
        <button type="button" class="primary" :disabled="pub.busy.value || pub.blockers.value.length > 0" @click="pub.prepare()">
          {{ t('publish.review') }}
        </button>
      </template>
      <div v-else class="publish__plan">
        <p v-if="!pub.plan.value.changes.length">{{ t('publish.upToDate') }}</p>
        <template v-else>
          <p>{{ plural('publish.willChange', pub.plan.value.changes.length) }}</p>
          <ul>
            <li v-for="p in pub.plan.value.added" :key="`a${p}`"><span class="tag add">{{ t('publish.add') }}</span> {{ p }}</li>
            <li v-for="p in pub.plan.value.updated" :key="`u${p}`"><span class="tag upd">{{ t('publish.update') }}</span> {{ p }}</li>
            <li v-for="p in pub.plan.value.removed" :key="`r${p}`"><span class="tag del">{{ t('publish.remove') }}</span> {{ p }}</li>
          </ul>
        </template>
        <fieldset v-if="pub.plan.value.changes.length" class="publish__mode">
          <legend>{{ t('publish.how') }}</legend>
          <label class="publish__radio">
            <input v-model="pub.publishMode.value" type="radio" value="commit" />
            {{ t('publish.commitTo', { branch: pub.repo.value.branch }) }}
          </label>
          <label class="publish__radio">
            <input v-model="pub.publishMode.value" type="radio" value="propose" />
            {{ t('publish.propose', { branch: pub.repo.value.branch }) }}
          </label>
        </fieldset>
        <div class="publish__actions">
          <button
            v-if="pub.plan.value.changes.length"
            type="button"
            class="primary"
            :disabled="pub.busy.value || pub.blockers.value.length > 0"
            @click="pub.publish()"
          >
            {{ pub.busy.value ? t('publish.publishing') : pub.publishMode.value === 'propose' ? t('publish.openPull') : t('publish.publish') }}
          </button>
          <button type="button" class="link" @click="pub.plan.value = null">{{ t('publish.cancel') }}</button>
        </div>
      </div>

      <p v-if="pub.served.value === 'yes'" class="publish__online">
        {{ t('publish.online') }} <a :href="pub.servedUrl.value" target="_blank" rel="noopener">{{ pub.servedUrl.value }}</a>
      </p>
      <div v-else-if="pub.served.value === 'no'" class="publish__offline" role="status">
        <p>{{ t('publish.notOnline', { url: pub.servedUrl.value }) }}</p>
        <p>{{ t('publish.enablePages', { branch: pub.repo.value.branch }) }}</p>
        <p v-if="/^https:\/\/[^/]+\.github\.io\//.test(pub.servedUrl.value)">{{ t('publish.customDomain') }}</p>
        <button type="button" class="link" @click="pub.checkServed()">{{ t('publish.checkAgain') }}</button>
      </div>
      <p v-else-if="pub.served.value === 'checking'" class="publish__online">{{ t('publish.checkingOnline') }}</p>
      <button v-else-if="pub.commitUrl.value && !pub.lastPull.value" type="button" class="link" @click="pub.checkServed()">
        {{ t('publish.checkOnline') }}
      </button>
      <p v-if="pub.served.value === 'yes' && pub.redirect.value" class="publish__redirect" :class="`is-${pub.redirect.value.state}`" role="status">
        <template v-if="pub.redirect.value.state === 'elsewhere'">{{ t('w3id.elsewhere', { url: pub.redirect.value.url }) }}</template>
        <template v-else>{{ t(`w3id.${pub.redirect.value.state}`) }}</template>
      </p>

      <p v-if="pub.lastPull.value" class="publish__done">
        {{ t('publish.proposed') }}
        <a :href="pub.lastPull.value.url" target="_blank" rel="noopener">{{ t('publish.pullRequest', { n: pub.lastPull.value.number }) }}</a>.
        {{ t('publish.mergeToPublish') }}
      </p>
      <p v-else-if="pub.commitUrl.value" class="publish__done">
        {{ t('publish.published') }}
        <a :href="pub.commitUrl.value" target="_blank" rel="noopener">{{ pub.lastCommit.value.slice(0, 7) }}</a>.
        {{ t('publish.pagesNote') }}
      </p>
    </div>

    <p v-if="pub.error.value" class="publish__error" role="alert">{{ tc(pub.error.value) }}</p>
  </section>
</template>

<style scoped>
.publish {
  display: grid;
  gap: 8px;
  font-size: 0.85rem;
}
.publish__title {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text-dark);
}
.publish__connect {
  display: grid;
  gap: 8px;
}
.publish__row {
  display: grid;
  grid-template-columns: 1fr 1fr 110px;
  gap: 8px;
}
label {
  display: grid;
  gap: 3px;
  font-weight: 600;
  color: var(--color-text-dark);
}
input {
  font: inherit;
  font-family: var(--font-mono);
  font-weight: 400;
  padding: 6px 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-input);
  min-width: 0;
}
.publish a {
  color: var(--color-accent);
}
.publish__hint {
  margin: 0;
  color: var(--color-text-lighter);
}
.primary {
  justify-self: start;
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
.publish__connected p {
  margin: 0 0 8px;
}
.publish__import {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
}
.publish__import p {
  margin: 0;
}
.publish__radio {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-weight: 400;
}
.publish__loaded {
  color: var(--color-success);
}
.publish__report {
  margin: 0 0 8px;
  padding-left: 18px;
  color: var(--color-text-lighter);
}
.publish__counts {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--color-text-lighter);
}
.publish__counts summary {
  cursor: pointer;
}
.publish__counts table {
  margin-top: 4px;
  border-collapse: collapse;
}
.publish__counts th,
.publish__counts td {
  padding: 2px 8px;
  text-align: right;
}
.publish__counts thead th:first-child {
  text-align: left;
}
.publish__counts th[scope='row'] {
  text-align: left;
  font-family: var(--font-mono);
  font-weight: 400;
}
.publish__mode {
  display: grid;
  gap: 4px;
  margin: 0 0 8px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.85rem;
}
.publish__mode legend {
  font-weight: 600;
  padding: 0 4px;
}
.publish__redirect {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--color-warning);
}
.publish__redirect.is-ok {
  color: var(--color-success);
}
.publish__online {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--color-text-lighter);
}
.publish__offline {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.85rem;
}
.publish__offline p {
  margin: 0 0 4px;
}
.publish__blockers {
  margin: 0 0 8px;
  padding-left: 18px;
  color: var(--color-danger);
}
.publish__plan ul {
  margin: 0 0 8px;
  padding-left: 0;
  list-style: none;
  font-family: var(--font-mono);
}
.tag {
  display: inline-block;
  min-width: 52px;
  font-family: var(--font);
  font-size: 0.7rem;
  text-transform: uppercase;
}
.tag.add {
  color: var(--color-success);
}
.tag.upd {
  color: var(--color-accent);
}
.tag.del {
  color: var(--color-danger);
}
.publish__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.publish__done {
  color: var(--color-success);
}
.publish__error {
  margin: 0;
  color: var(--color-danger);
}
</style>
