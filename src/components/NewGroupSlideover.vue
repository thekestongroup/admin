<script setup lang="ts">
import { Button, type ButtonStatus, Input, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ApiError, api } from '../lib/api'

const { t } = useI18n()

/** Creating a group: its name; then its page, to add users and permissions. */
const props = defineProps<{ orgId: string }>()
const open = defineModel<boolean>('open', { default: false })
const router = useRouter()
const { notify } = useNotifications()

const name = ref('')
const nameError = ref<string>()
const status = ref<ButtonStatus>('idle')

watch(open, (o) => {
  if (!o) return
  name.value = ''
  nameError.value = undefined
  status.value = 'idle'
})

async function create() {
  nameError.value = name.value.trim() ? undefined : t('groups.enterName')
  if (nameError.value) return
  status.value = 'loading'
  try {
    const g = await api.createGroup(props.orgId, name.value)
    notify({ type: 'success', title: t('groups.created', { name: g.name }), description: t('groups.createdDescription') })
    status.value = 'idle'
    open.value = false
    router.push(`/organisations/${props.orgId}/groups/${g.id}`)
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'name') nameError.value = e.message
    else notify({ type: 'error', title: t('groups.couldntCreate'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Slideover v-model:open="open" :title="t('groups.newGroup')" :description="t('groups.newGroupDescription')" initial-focus="auto">
    <template #body>
      <form id="new-group" novalidate @submit.prevent="create">
        <Input v-model="name" :label="t('common.name')" :placeholder="t('groups.namePlaceholder')" :error-text="nameError" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button type="submit" form="new-group" variant="primary" :status="status" :loading-text="t('groups.creating')">
        {{ t('groups.create') }}
      </Button>
    </template>
  </Slideover>
</template>
