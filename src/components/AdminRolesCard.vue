<script setup lang="ts">
import { Button, type ButtonStatus, Card, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api, type AdminRole, type PermissionId, type UserDetail } from '../lib/api'
import RolesField, { type Roles } from './RolesField.vue'

/**
 * A user's admin centre access, on their page: User, or admin roles (Global
 * admin, User admin…). Saving reloads their permissions.
 */
const props = defineProps<{
  orgId: string
  user: UserDetail
  iAmGlobalAdmin: boolean
  myPermissions: PermissionId[]
}>()
const emit = defineEmits<{ changed: [] }>()
const { notify } = useNotifications()

const catalogue = ref<AdminRole[]>([])
onMounted(async () => {
  catalogue.value = await api.roles(props.orgId).catch(() => [])
})

const fromUser = (): Roles => ({
  admin: props.user.role === 'global_admin' || props.user.roles.length > 0,
  global: props.user.role === 'global_admin',
  roles: [...props.user.roles],
})
const access = ref<Roles>(fromUser())
watch(() => props.user, () => (access.value = fromUser()))
const error = ref<string>()
const status = ref<ButtonStatus>('idle')

const wanted = computed(() => ({
  global: access.value.admin && access.value.global,
  roles: access.value.admin && !access.value.global ? [...access.value.roles].sort() : [],
}))
const changed = computed(() => {
  const now = fromUser()
  return wanted.value.global !== now.global || wanted.value.roles.join() !== [...now.roles].sort().join()
})

async function save() {
  error.value = undefined
  if (access.value.admin && !access.value.global && !access.value.roles.length) {
    error.value = 'Choose at least one role'
    return
  }
  status.value = 'loading'
  try {
    if (wanted.value.global !== (props.user.role === 'global_admin'))
      await api.updateUser(props.orgId, props.user.id, { role: wanted.value.global ? 'global_admin' : 'member' })
    if (wanted.value.roles.join() !== [...props.user.roles].sort().join())
      await api.setRoles(props.orgId, props.user.id, wanted.value.roles)
    status.value = 'success'
    emit('changed')
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) error.value = e.message
    else notify({ type: 'error', title: 'Couldn’t save the roles', description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card title="Admin roles" description="What they can do in the admin centre. Their groups can give them permissions too.">
    <RolesField
      v-model="access"
      :catalogue="catalogue"
      :i-am-global-admin="iAmGlobalAdmin"
      :my-permissions="myPermissions"
      :error-text="error"
    />
    <template #footer>
      <Button
        variant="primary"
        v-model:status="status"
        :disabled="!changed && status === 'idle'"
        loading-text="Saving"
        success-text="Saved"
        @click="save"
      >
        Save roles
      </Button>
    </template>
  </Card>
</template>
