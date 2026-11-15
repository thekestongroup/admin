<script setup lang="ts">
import { Button, type ButtonStatus, Card, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type User } from '../lib/api'

/** Deleting one user, from their page: kept 30 days in Deleted users. */
const props = defineProps<{ orgId: string; user: User }>()
const router = useRouter()
const { notify } = useNotifications()

const asking = ref(false)
const status = ref<ButtonStatus>('idle')

async function remove() {
  status.value = 'loading'
  try {
    await api.deleteUser(props.orgId, props.user.id)
    notify({
      type: 'success',
      title: 'User deleted',
      description: `${props.user.name} has been signed out everywhere. You can restore them from Deleted users for 30 days.`,
    })
    await router.push(`/organisations/${props.orgId}/users`)
  } catch (e) {
    status.value = 'idle'
    asking.value = false
    notify({ type: 'error', title: 'Couldn’t delete the user', description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card title="Delete" description="Signs them out everywhere. For 30 days you can restore them, with their groups, from Deleted users.">
    <div><Button variant="danger" @click="asking = true">Delete user</Button></div>
  </Card>

  <Slideover
    v-model:open="asking"
    :title="`Delete ${user.name}?`"
    description="They’re signed out of Keston and every app, and can’t sign in. For 30 days you can restore them, with their groups, from Deleted users; then they’re removed for good."
  >
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">Cancel</Button>
      <Button variant="danger" :status="status" loading-text="Deleting" @click="remove">Delete user</Button>
    </template>
  </Slideover>
</template>
