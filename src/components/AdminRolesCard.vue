<script setup lang="ts">
import { Button, type ButtonStatus, Card, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api, type AdminRole, type PermissionId, type UserDetail } from '../lib/api'
import RolesField, { type Roles } from './RolesField.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * A user's role, on their page: User, Global Admin or (in The Keston Group)
 * TKG Admin, and any narrower admin roles for a User. Saving reloads their
 * permissions.
 */
const props = defineProps<{
  orgId: string
  user: UserDetail
  iAmGlobalAdmin: boolean
  iAmPlatformAdmin?: boolean
  platformOrg?: boolean
  myPermissions: PermissionId[]
}>()
const emit = defineEmits<{ changed: [] }>()
const { notify } = useNotifications()

const catalogue = ref<AdminRole[]>([])
onMounted(async () => {
  catalogue.value = await api.roles(props.orgId).catch(() => [])
})

const fromUser = (): Roles => ({
  role: props.user.role === 'global_admin' ? (props.user.platformAdmin ? 'tkg_admin' : 'global_admin') : 'member',
  roles: props.user.role === 'global_admin' ? [] : [...props.user.roles],
})
const access = ref<Roles>(fromUser())
watch(() => props.user, () => (access.value = fromUser()))
const error = ref<string>()
const status = ref<ButtonStatus>('idle')

const wanted = computed(() => ({
  role: (access.value.role === 'member' ? 'member' : 'global_admin') as 'member' | 'global_admin',
  tkg: access.value.role === 'tkg_admin',
  roles: access.value.role === 'member' ? access.value.roles.toSorted() : [],
}))
const changed = computed(() => {
  const now = fromUser()
  return access.value.role !== now.role || wanted.value.roles.join() !== now.roles.toSorted().join()
})

async function save() {
  error.value = undefined
  status.value = 'loading'
  try {
    const roleChanged = wanted.value.role !== props.user.role
    const tkgChanged = wanted.value.tkg !== props.user.platformAdmin
    if (roleChanged || tkgChanged)
      await api.updateUser(props.orgId, props.user.id, {
        role: wanted.value.role,
        platformAdmin: tkgChanged ? wanted.value.tkg : undefined,
      })
    if (wanted.value.roles.join() !== props.user.roles.toSorted().join())
      await api.setRoles(props.orgId, props.user.id, wanted.value.roles)
    status.value = 'success'
    emit('changed')
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) error.value = e.message
    else notify({ type: 'error', title: t('roles.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card :title="t('roles.cardTitle')" :description="t('roles.cardDescription')">
    <RolesField
      v-model="access"
      :catalogue="catalogue"
      :i-am-global-admin="iAmGlobalAdmin"
      :i-am-platform-admin="iAmPlatformAdmin"
      :platform-org="platformOrg"
      :my-permissions="myPermissions"
      :error-text="error"
    />
    <template #footer>
      <Button
        variant="primary"
        v-model:status="status"
        :disabled="!changed && status === 'idle'"
        :loading-text="t('common.saving')"
        :success-text="t('common.saved')"
        @click="save"
      >
        {{ t('roles.save') }}
      </Button>
    </template>
  </Card>
</template>
