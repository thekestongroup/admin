<script setup lang="ts">
import { Checkbox, RadioGroup } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { AdminRole, PermissionId } from '../lib/api'

/**
 * Whether someone uses the admin centre, and with which admin roles: User
 * (no access), or Admin roles, ticking Global admin and/or built-in roles.
 * Someone can give a role only if they have every permission it gives
 * (global admins can give any, and only they can give Global admin).
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

const canGive = (r: AdminRole) => props.iAmGlobalAdmin || r.permissions.every((p) => props.myPermissions.includes(p))
function toggle(id: string, on: boolean) {
  const roles = on ? [...model.value.roles, id] : model.value.roles.filter((r) => r !== id)
  model.value = { ...model.value, roles }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <RadioGroup v-model="access" label="Admin centre access" :options="accessOptions" />
    <fieldset v-if="model.admin" class="flex flex-col gap-3">
      <legend class="mb-1 text-sm font-bold">Roles</legend>
      <Checkbox
        :model-value="model.global"
        label="Global admin"
        description="Can do everything, including making other global admins."
        :disabled="!iAmGlobalAdmin"
        @update:model-value="model = { ...model, global: !!$event }"
      />
      <Checkbox
        v-for="r in catalogue"
        :key="r.id"
        :model-value="model.global || model.roles.includes(r.id)"
        :label="r.label"
        :description="r.description"
        :disabled="model.global || !canGive(r)"
        @update:model-value="toggle(r.id, !!$event)"
      />
      <p v-if="errorText" class="text-sm text-red" role="alert">{{ errorText }}</p>
    </fieldset>
  </div>
</template>
