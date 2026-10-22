<script setup lang="ts">
// Connect to a GitHub repository and publish the project in one commit
// (TASKS Phase 6, SPEC §7.1).
import { ref } from 'vue';
import type { usePublish } from '../composables/usePublish';
import type { ImportMode } from '../core/import';

defineProps<{ pub: ReturnType<typeof usePublish> }>();
const rootPath = ref('');
const mode = ref<ImportMode>('keep');
</script>

<template>
  <section class="publish" aria-label="Publish to GitHub">
    <h2 class="publish__title">Publish to GitHub</h2>

    <form v-if="!pub.connected.value" class="publish__connect" @submit.prevent="pub.connect()">
      <div class="publish__row">
        <label>
          <span>Owner</span>
          <input v-model.trim="pub.repo.value.owner" required spellcheck="false" placeholder="erdera" />
        </label>
        <label>
          <span>Repository</span>
          <input v-model.trim="pub.repo.value.repo" required spellcheck="false" placeholder="my-fdp" />
        </label>
        <label class="publish__branch">
          <span>Branch</span>
          <input v-model.trim="pub.repo.value.branch" required spellcheck="false" />
        </label>
      </div>
      <label>
        <span>Token</span>
        <input v-model.trim="pub.token.value" type="password" required autocomplete="off" />
      </label>
      <p class="publish__hint">
        A
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a>
        with <em>Contents: read and write</em> on this repository only (plus <em>Workflows: read and write</em> when
        the project pings an Index). It is kept for this browser tab and sent
        only to api.github.com.
      </p>
      <button type="submit" class="primary" :disabled="pub.busy.value">{{ pub.busy.value ? 'Connecting…' : 'Connect' }}</button>
    </form>

    <div v-else class="publish__connected">
      <p>
        Connected to
        <a :href="`https://github.com/${pub.repo.value.owner}/${pub.repo.value.repo}/tree/${pub.repo.value.branch}`" target="_blank" rel="noopener">
          {{ pub.repo.value.owner }}/{{ pub.repo.value.repo }}
        </a>
        ({{ pub.repo.value.branch }} at <code>{{ pub.head.value.slice(0, 7) }}</code>)
        <button type="button" class="link" @click="pub.disconnect()">Disconnect</button>
      </p>

      <form v-if="pub.canImport.value" class="publish__import" @submit.prevent="pub.importExisting(rootPath, mode)">
        <p>No FDPlight project here. Import an existing FAIR Data Point from this repository?</p>
        <label>
          <span>Root file</span>
          <input v-model.trim="rootPath" list="fdplight-ttl-files" required spellcheck="false" placeholder="e.g. sites/my-fdp/fdp.ttl" />
          <datalist id="fdplight-ttl-files">
            <option v-for="f in pub.importCandidates.value" :key="f" :value="f" />
          </datalist>
        </label>
        <label class="publish__radio">
          <input v-model="mode" type="radio" value="keep" />
          Keep the existing IRIs. Identifiers and the Index entry stay; new entities use FDPlight's layout.
        </label>
        <label class="publish__radio">
          <input v-model="mode" type="radio" value="migrate" />
          Move to FDPlight's layout. All IRIs change; the old files stay until you delete them.
        </label>
        <button type="submit" class="primary" :disabled="pub.busy.value">Import</button>
      </form>
      <p v-if="pub.loaded.value" class="publish__loaded">Loaded the project from the repository. Nothing is written until you publish.</p>
      <ul v-if="pub.loadReport.value.length" class="publish__report">
        <li v-for="r in pub.loadReport.value" :key="r">{{ r }}</li>
      </ul>
      <ul v-if="pub.blockers.value.length" class="publish__blockers">
        <li v-for="b in pub.blockers.value" :key="b">{{ b }}</li>
      </ul>

      <template v-if="!pub.plan.value">
        <button type="button" class="primary" :disabled="pub.busy.value || pub.blockers.value.length > 0" @click="pub.prepare()">
          Review changes
        </button>
      </template>
      <div v-else class="publish__plan">
        <p v-if="!pub.plan.value.changes.length">Nothing to publish: the repository is up to date.</p>
        <template v-else>
          <p>{{ pub.plan.value.changes.length }} file(s) will change in one commit:</p>
          <ul>
            <li v-for="p in pub.plan.value.added" :key="`a${p}`"><span class="tag add">add</span> {{ p }}</li>
            <li v-for="p in pub.plan.value.updated" :key="`u${p}`"><span class="tag upd">update</span> {{ p }}</li>
            <li v-for="p in pub.plan.value.removed" :key="`r${p}`"><span class="tag del">remove</span> {{ p }}</li>
          </ul>
        </template>
        <div class="publish__actions">
          <button
            v-if="pub.plan.value.changes.length"
            type="button"
            class="primary"
            :disabled="pub.busy.value || pub.blockers.value.length > 0"
            @click="pub.publish()"
          >
            {{ pub.busy.value ? 'Publishing…' : 'Publish' }}
          </button>
          <button type="button" class="link" @click="pub.plan.value = null">Cancel</button>
        </div>
      </div>

      <p v-if="pub.commitUrl.value" class="publish__done">
        Published: <a :href="pub.commitUrl.value" target="_blank" rel="noopener">{{ pub.lastCommit.value.slice(0, 7) }}</a>.
        GitHub Pages serves it once its deployment has run (Settings → Pages must be enabled for the repository).
      </p>
    </div>

    <p v-if="pub.error.value" class="publish__error" role="alert">{{ pub.error.value }}</p>
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
