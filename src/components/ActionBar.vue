<script setup lang="ts">
import { Button } from '@thekestongroup/ui'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'

/**
 * A row of everyday actions under a page's title: quiet buttons with an
 * icon, red for destructive ones. Matches PageHeader's toolbar in
 * @thekestongroup/ui (not released yet); swap to that once it is.
 */
export interface Action {
  label: string
  icon?: Component
  onSelect?: () => void
  /** A link (RouterLink). */
  to?: string
  danger?: boolean
}

defineProps<{ actions: Action[]; label: string }>()
defineSlots<{ default?(): unknown }>()
</script>

<template>
  <div role="group" :aria-label="label" class="-ml-2.5 flex min-h-9.5 flex-wrap items-center gap-1">
    <slot />
    <Button
      v-for="a in actions"
      :key="a.label"
      :as="a.to ? RouterLink : 'button'"
      :to="a.to"
      variant="ghost"
      :class="[
        'px-2.5',
        a.danger && 'text-red not-disabled:not-aria-disabled:hover:bg-red/10 not-disabled:not-aria-disabled:active:bg-red/15',
      ]"
      @click="a.onSelect?.()"
    >
      <template v-if="a.icon" #leading><component :is="a.icon" aria-hidden="true" /></template>
      {{ a.label }}
    </Button>
  </div>
</template>
