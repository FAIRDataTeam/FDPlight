<script setup lang="ts">
// The entity tree (TASKS Phase 3): an entity, then per child type its list
// title, its children (recursively) and an "Add" button.
import { computed } from 'vue';
import type { ProjectState } from '../composables/useProject';
import { findByPath, pathOf } from '../core/project';
import { typeByKey } from '../core/profile';

const props = defineProps<{ state: ProjectState; path: string }>();

const entity = computed(() => findByPath(props.state.project, props.path)!);
const type = computed(() => props.state.typeOf(entity.value));
const label = computed(() => props.state.titleOf(props.path) || (entity.value.parent === null ? 'FAIR Data Point' : entity.value.id));
const groups = computed(() =>
  type.value.children.map((c) => ({
    spec: c,
    childType: typeByKey(props.state.project.types, c.type),
    paths: props.state.project.entities
      .filter((e) => e.parent === props.path && e.type === c.type)
      .map((e) => pathOf(props.state.project, e)),
  })),
);
</script>

<template>
  <li class="tree__item">
    <button
      type="button"
      class="tree__node"
      :class="{ 'is-selected': state.selected.value === path }"
      :aria-current="state.selected.value === path ? 'true' : undefined"
      @click="state.selected.value = path"
    >
      <span class="tree__type">{{ type.name }}</span>
      <span class="tree__label">{{ label }}</span>
    </button>
    <div v-for="g in groups" :key="g.spec.type" class="tree__group">
      <div class="tree__group-title">{{ g.spec.title }}</div>
      <ul v-if="g.paths.length" class="tree__list">
        <EntityTree v-for="p in g.paths" :key="p" :state="state" :path="p" />
      </ul>
      <button type="button" class="tree__add" @click="state.add(path, g.spec.type)">+ Add {{ g.childType.name.toLowerCase() }}</button>
    </div>
  </li>
</template>

<style scoped>
.tree__item {
  list-style: none;
}
.tree__node {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  font: inherit;
  text-align: left;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--color-text-default);
  cursor: pointer;
}
.tree__node:hover {
  background: var(--color-primary-tint);
}
.tree__node.is-selected {
  background: var(--color-primary);
  color: #fff;
}
.tree__type {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.75;
}
.tree__label {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.tree__group {
  margin: 2px 0 6px 14px;
  padding-left: 10px;
  border-left: 2px solid var(--color-border);
}
.tree__group-title {
  font-size: 0.75rem;
  color: var(--color-text-lighter);
  margin: 4px 0 2px;
}
.tree__list {
  margin: 0;
  padding: 0;
}
.tree__add {
  font: inherit;
  font-size: 0.8rem;
  padding: 2px 6px;
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.tree__add:hover {
  text-decoration: underline;
}
</style>
