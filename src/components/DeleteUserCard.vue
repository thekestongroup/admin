<script setup lang="ts">
import { Button, type ButtonStatus, Card, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type User } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
      title: t('deleteUser.deleted'),
      description: t('deleteUser.deletedDescription', { name: props.user.name }),
    })
    await router.push(`/organisations/${props.orgId}/users`)
  } catch (e) {
    status.value = 'idle'
    asking.value = false
    notify({ type: 'error', title: t('deleteUser.couldntDelete'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card :title="t('common.delete')" :description="t('deleteUser.cardDescription')">
    <div><Button variant="danger" @click="asking = true">{{ t('deleteUser.button') }}</Button></div>
  </Card>

  <Slideover
    v-model:open="asking"
    :title="t('deleteUser.title', { name: user.name })"
    :description="t('deleteUser.description')"
  >
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="danger" :status="status" :loading-text="t('common.deleting')" @click="remove">{{ t('deleteUser.button') }}</Button>
    </template>
  </Slideover>
</template>
