<script setup lang="ts">
import { RadioGroup, Select } from '@thekestongroup/ui'
import { computed } from 'vue'
import type { AdminRole, PermissionId } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * A person's user role: User (no admin centre access), Global Admin, or, in
 * The Keston Group only, TKG Admin (a global admin who sees every
 * organisation). A User can also be given narrower admin roles (User admin…)
 * from a searchable list. Someone can give a role only if they have every
 * permission it gives (global admins can give any).
 */
export type UserRole = 'member' | 'global_admin' | 'tkg_admin'
export interface Roles {
  role: UserRole
  /** Narrower admin roles, besides Global Admin (only for a User). */
  roles: string[]
}

const props = defineProps<{
  catalogue: AdminRole[]
  /** The person choosing is a global admin. */
  iAmGlobalAdmin: boolean
  /** The person choosing is a TKG Admin. */
  iAmPlatformAdmin?: boolean
  /** The organisation is The Keston Group. */
  platformOrg?: boolean
  /** The person choosing's own permissions. */
  myPermissions: PermissionId[]
  errorText?: string
}>()
const model = defineModel<Roles>({ required: true })

// TKG Admin is only for The Keston Group, and only TKG Admins can give it
// (or see it, unless the person already has it).
const showTkg = computed(() => !!props.platformOrg && (!!props.iAmPlatformAdmin || model.value.role === 'tkg_admin'))
const roleOptions = computed(() => [
  { label: t('roles.user'), value: 'member', description: t('roles.userDescription') },
  { label: t('roles.globalAdmin'), value: 'global_admin', description: t('roles.globalAdminDescription'), disabled: !props.iAmGlobalAdmin },
  ...(showTkg.value
    ? [{ label: t('roles.tkgAdmin'), value: 'tkg_admin', description: t('roles.tkgAdminDescription'), disabled: !props.iAmPlatformAdmin }]
    : []),
])
const role = computed({
  get: () => model.value.role,
  // Narrower roles are for a User only.
  set: (v) => (model.value = { role: v as UserRole, roles: v === 'member' ? model.value.roles : [] }),
})

const canGive = (r: AdminRole) => props.iAmGlobalAdmin || r.permissions.every((p) => props.myPermissions.includes(p))
const options = computed(() => props.catalogue.map((r) => ({ label: r.label, value: r.id, description: r.description, disabled: !canGive(r) })))
const chosen = computed({
  get: () => model.value.roles,
  set: (v: unknown) => (model.value = { ...model.value, roles: (v as string[] | undefined) ?? [] }),
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <RadioGroup v-model="role" :label="t('roles.userRole')" :options="roleOptions" />
    <Select
      v-if="model.role === 'member' && catalogue.length"
      v-model="chosen"
      :label="t('roles.adminRoles')"
      :helper="t('roles.adminRolesHelper')"
      :placeholder="t('roles.search')"
      :options="options"
      :error-text="errorText"
      multiple
      searchable
    />
  </div>
</template>
