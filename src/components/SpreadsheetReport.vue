<script setup lang="ts">
// What the spreadsheet import did (SPEC §4.4), shown above the forms until
// dismissed: rows per sheet, records created, placement, references not
// found, defaults, what was not imported, duplicate titles.
import { computed } from 'vue';
import type { SpreadsheetReport } from '../core/spreadsheetImport';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{ report: SpreadsheetReport }>();
defineEmits<{ close: [] }>();
const { t, tc, plural } = useI18n();

// Problems first, then what was done.
const SECTIONS = ['unresolved', 'duplicates', 'notMapped', 'placed', 'defaults', 'created', 'sheets'] as const;
const sections = computed(() => SECTIONS.map((key) => ({ key, items: props.report[key] })).filter((s) => s.items.length));
const created = computed(() => props.report.created.length);
</script>

<template>
  <section class="sheet-report" :aria-label="t('sheet.title')">
    <div class="sheet-report__head">
      <h2>{{ t('sheet.title') }}</h2>
      <button type="button" class="sheet-report__close" @click="$emit('close')">{{ t('sheet.close') }}</button>
    </div>
    <p class="sheet-report__summary" role="status">
      {{ plural('sheet.summary', created) }} {{ t('sheet.redCounts') }}
    </p>
    <details v-for="s in sections" :key="s.key" class="sheet-report__section" :class="`is-${s.key}`" :open="s.key !== 'sheets' && s.key !== 'created'">
      <summary>{{ t(`sheet.${s.key}`) }} ({{ s.items.length }})</summary>
      <ul>
        <li v-for="(item, i) in s.items" :key="i">{{ tc(item) }}</li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.sheet-report {
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-accent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: 12px 18px;
  font-size: 0.85rem;
}
.sheet-report__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.sheet-report__head h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-primary);
}
.sheet-report__close {
  margin-left: auto;
  font: inherit;
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.sheet-report__summary {
  margin: 6px 0 8px;
}
.sheet-report__section summary {
  font-weight: 600;
  cursor: pointer;
}
.sheet-report__section ul {
  margin: 4px 0 8px;
  padding-left: 18px;
}
.sheet-report__section.is-unresolved summary,
.sheet-report__section.is-duplicates summary {
  color: var(--color-danger);
}
</style>
