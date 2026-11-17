<script setup lang="ts">
import { Button, type ButtonStatus, Card, Input, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { ApiError, api, type AccountMove, type User } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Moving one account to another organisation, from the user's page (global
 * admins). The other organisation's global admin has to accept.
 */
const props = defineProps<{ orgId: string; user: User }>()
const { notify } = useNotifications()

const domain = ref('')
const error = ref<string>()
const status = ref<ButtonStatus>('idle')
const pending = ref<AccountMove>()
const username = computed(() => props.user.email.split('@')[0])

async function load() {
  const list = await api.moves(props.orgId).catch(() => [])
  pending.value = list.find((m) => m.userId === props.user.id && m.status === 'pending')
}
onMounted(load)

async function request() {
  error.value = undefined
  status.value = 'loading'
  try {
    const m = await api.requestMove(props.orgId, props.user.id, domain.value)
    notify({
      type: 'success',
      title: t('moves.card.requested'),
      description: t('moves.card.requestedDescription', { to: m.toOrganisationName, email: m.newEmail }),
    })
    domain.value = ''
    await load()
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : String(e)
  } finally {
    status.value = 'idle'
  }
}
async function cancel() {
  if (!pending.value) return
  try {
    await api.decideMove(props.orgId, pending.value.id, 'cancel')
    notify({ type: 'success', title: t('moves.cancelled') })
    await load()
  } catch (e) {
    notify({ type: 'error', title: t('moves.couldntDecide'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card :title="t('moves.card.title')" :description="t('moves.card.description', { username })">
    <div v-if="pending" class="flex flex-wrap items-center gap-3">
      <p class="flex-1 text-sm">{{ t('moves.card.pending', { to: pending.toOrganisationName }) }}</p>
      <Button size="sm" @click="cancel">{{ t('moves.card.cancel') }}</Button>
    </div>
    <form v-else class="flex flex-wrap items-end gap-3" @submit.prevent="request">
      <Input
        v-model="domain"
        class="min-w-60 flex-1"
        autocomplete="off"
        :label="t('moves.card.domain')"
        :placeholder="t('moves.card.domainPlaceholder')"
        :error-text="error"
      />
      <Button type="submit" :status="status" :disabled="!domain.trim()">{{ t('moves.card.request') }}</Button>
    </form>
  </Card>
</template>
