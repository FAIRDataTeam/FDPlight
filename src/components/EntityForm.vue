<script setup lang="ts">
// One entity's form, rendered by the shared record-core renderer.
import { computed, provide } from 'vue';
import PreviewField from '@fairdatateam/record-core/components/PreviewField.vue';
import { newEntryFor, type RecordIssue, type RecordNode } from '@fairdatateam/record-core/record';
import type { Schema } from '@fairdatateam/record-core/types';
import { FILL_CONTEXT } from '@fairdatateam/record-core/useFillContext';
import { findingText, type ShaclFinding } from '../core/validation';

const props = defineProps<{ schema: Schema; values: RecordNode; findings?: ShaclFinding[] }>();

const issues = computed<RecordIssue[]>(() =>
  (props.findings ?? []).map((f) => ({
    loc: f.loc ?? '',
    severity: f.severity,
    code: f.component,
    message: findingText(f),
    fieldName: f.fieldName,
  })),
);
// Findings the check could not place on a field are listed above the form.
const unplaced = computed(() => (props.findings ?? []).filter((f) => f.loc === null));

// Lookups come in a later phase; validation findings are placed on fields.
provide(FILL_CONTEXT, {
  search: () => [],
  remote: () => null,
  describe: () => undefined,
  issuesAt: (loc) => issues.value.filter((i) => i.loc === loc),
  issueText: (issue) => issue.message || issue.code,
  newEntry: (field) => newEntryFor(props.schema, field),
});

const groups = computed(() => props.schema.groups.slice().sort((a, b) => a.order - b.order));
</script>

<template>
  <div class="form-preview">
    <p v-for="(f, i) in unplaced" :key="i" class="record-issue" :class="`is-${f.severity}`">
      <strong v-if="f.fieldName">{{ f.fieldName }}:</strong> {{ findingText(f) }}
    </p>
    <section v-for="g in groups" :key="g.id">
      <div class="form-preview__group-title">{{ g.label }}</div>
      <PreviewField v-for="f in g.fields" :key="f.id" :field="f" :schema="schema" :node="values" />
    </section>
  </div>
</template>
