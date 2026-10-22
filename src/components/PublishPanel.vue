<script setup lang="ts">
// Connect to a GitHub repository and publish the project in one commit
// (TASKS Phase 6, SPEC §7.1).
import type { usePublish } from '../composables/usePublish';

defineProps<{ pub: ReturnType<typeof usePublish> }>();
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
        with <em>Contents: read and write</em> on this repository only. It is kept for this browser tab and sent
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
