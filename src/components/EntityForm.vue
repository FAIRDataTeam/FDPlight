<script setup lang="ts">
// One entity's form, rendered by the shared record-core renderer.
import { computed, provide } from 'vue';
import PreviewField from '@fairdatateam/record-core/components/PreviewField.vue';
import { newEntryFor, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { FILL_CONTEXT } from '@fairdatateam/record-core/useFillContext';

const props = defineProps<{ schema: Schema; values: RecordNode }>();

// Lookups and validation messages come in later phases (record lookups,
// SHACL check); until then the renderer gets an inert context.
provide(FILL_CONTEXT, {
  search: () => [],
  remote: () => null,
  describe: () => undefined,
  issuesAt: () => [],
  issueText: (issue) => issue.message || issue.code,
  newEntry: (field) => newEntryFor(props.schema, field),
});

const groups = computed(() => props.schema.groups.slice().sort((a, b) => a.order - b.order));
</script>

<template>
  <div class="form-preview">
    <section v-for="g in groups" :key="g.id">
      <div class="form-preview__group-title">{{ g.label }}</div>
      <PreviewField v-for="f in g.fields" :key="f.id" :field="f" :schema="schema" :node="values" />
    </section>
  </div>
</template>
