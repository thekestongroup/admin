<script setup lang="ts">
import { Button, Card, Input, Select } from '@thekestongroup/ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The filters and sort of a list page (Users, Groups), shown under the page's
 * action bar: a search box, the page's own filters (default slot) and how to
 * sort. The page keeps the values in the URL (see lib/listQuery.ts).
 */
defineProps<{
  /** How many filters are set (for "Clear filters"). */
  active: number
  sortOptions: { label: string; value: string }[]
  /** Label for the search box, e.g. "Search by name or email". */
  searchLabel: string
}>()

const q = defineModel<string | undefined>('q')
const sort = defineModel<string | undefined>('sort')
const dir = defineModel<string | undefined>('dir')
defineEmits<{ clear: [] }>()

// Typing in the search box waits a moment before it changes the URL.
const typed = ref(q.value ?? '')
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  if ((v ?? '') !== typed.value) typed.value = v ?? ''
})
watch(typed, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if ((v.trim() || undefined) !== q.value) q.value = v.trim() || undefined
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

const directions = computed(() => [
  { label: t('listFilters.ascending'), value: 'asc' },
  { label: t('listFilters.descending'), value: 'desc' },
])
</script>

<template>
  <Card>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Input v-model="typed" type="search" :label="searchLabel" :placeholder="t('listFilters.searchPlaceholder')" />
      <slot />
      <Select
        :model-value="sort ?? 'name'"
        :label="t('listFilters.sortBy')"
        :options="sortOptions"
        @update:model-value="sort = String($event)"
      />
      <Select :model-value="dir ?? 'asc'" :label="t('listFilters.order')" :options="directions" @update:model-value="dir = String($event)" />
    </div>
    <div v-if="active" class="mt-4">
      <Button size="sm" variant="ghost" @click="$emit('clear')">{{ t('listFilters.clear') }}</Button>
    </div>
  </Card>
</template>
