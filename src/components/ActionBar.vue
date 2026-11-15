<script setup lang="ts">
import { Button } from '@thekestongroup/ui'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'

/**
 * A row of everyday actions under a page's title, in a white bar like a
 * Card: ghost buttons with an
 * icon. Matches PageHeader's toolbar in
 * @thekestongroup/ui (not released yet); swap to that once it is.
 */
export interface Action {
  label: string
  icon?: Component
  onSelect?: () => void
  /** A link (RouterLink). */
  to?: string
}

defineProps<{ actions: Action[]; label: string }>()
defineSlots<{ default?(): unknown }>()
</script>

<template>
  <div role="group" :aria-label="label" class="flex flex-wrap items-center gap-1 rounded-lg border border-black/15 bg-white p-1">
    <slot />
    <Button
      v-for="a in actions"
      :key="a.label"
      :as="a.to ? RouterLink : 'button'"
      :to="a.to"
      variant="ghost"
      @click="a.onSelect?.()"
    >
      <template v-if="a.icon" #leading><component :is="a.icon" aria-hidden="true" /></template>
      {{ a.label }}
    </Button>
  </div>
</template>
