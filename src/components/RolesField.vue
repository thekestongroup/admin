<script setup lang="ts">
import { RadioGroup, Select } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { AdminRole, PermissionId } from '../lib/api'

/**
 * Whether someone uses the admin centre, and with which admin roles: User
 * (no access), or Admin roles, chosen from a searchable list (Global admin,
 * User admin…). Someone can give a role only if they have every permission
 * it gives (global admins can give any, and only they can give Global
 * admin).
 */
export interface Roles {
  admin: boolean
  global: boolean
  roles: string[]
}

const props = defineProps<{
  catalogue: AdminRole[]
  /** The person choosing is a global admin. */
  iAmGlobalAdmin: boolean
  /** The person choosing's own permissions. */
  myPermissions: PermissionId[]
  errorText?: string
}>()
const model = defineModel<Roles>({ required: true })

const accessOptions = [
  { label: 'User', value: 'user', description: 'No admin centre access.' },
  { label: 'Admin roles', value: 'admin', description: 'Give the user access to the admin centre.' },
]
const access = computed({
  get: () => (model.value.admin ? 'admin' : 'user'),
  set: (v) => (model.value = { ...model.value, admin: v === 'admin' }),
})

const GLOBAL = 'global_admin'
const canGive = (r: AdminRole) => props.iAmGlobalAdmin || r.permissions.every((p) => props.myPermissions.includes(p))
const options = computed(() => [
  { label: 'Global admin', value: GLOBAL, description: 'Can do everything, including making other global admins.', disabled: !props.iAmGlobalAdmin },
  ...props.catalogue.map((r) => ({ label: r.label, value: r.id, description: r.description, disabled: !canGive(r) })),
])
const chosen = computed({
  get: () => (model.value.global ? [GLOBAL, ...model.value.roles] : model.value.roles),
  set: (v: unknown) => {
    const ids = (v as string[] | undefined) ?? []
    model.value = { ...model.value, global: ids.includes(GLOBAL), roles: ids.filter((id) => id !== GLOBAL) }
  },
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <RadioGroup v-model="access" label="Admin centre access" :options="accessOptions" />
    <Select
      v-if="model.admin"
      v-model="chosen"
      label="Roles"
      helper="Global admin can do everything; the others, just their part."
      placeholder="Search roles…"
      :options="options"
      :error-text="errorText"
      multiple
      searchable
    />
  </div>
</template>
