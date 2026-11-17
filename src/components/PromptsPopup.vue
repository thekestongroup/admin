<script setup lang="ts">
import { Button, type ButtonStatus, Slideover, useNotifications } from '@thekestongroup/ui'
import { computed, ref, watch } from 'vue'
import { api, type AccountMove, type Guest } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The one-time pop-up for a guest invitation (to the person invited) or a
 * request to move an account into your organisation (to its global admins).
 * It appears the first time you open Keston Admin after it arrives
 * (`popup` from Keston ID), and is marked as seen when shown. It can be
 * opened again from the notification (`show`).
 */
const props = defineProps<{
  invitations: (Guest & { popup: boolean })[]
  moves: (AccountMove & { popup: boolean })[]
  /** Open it whatever has been seen (from a notification). */
  show?: boolean
}>()
const emit = defineEmits<{ answered: []; 'update:show': [boolean] }>()
const { notify } = useNotifications()

const open = ref(false)
const status = ref<ButtonStatus>('idle')

type Item = { kind: 'invite'; data: Guest & { popup: boolean } } | { kind: 'move'; data: AccountMove & { popup: boolean } }
const items = computed<Item[]>(() => [
  ...props.invitations.map((data) => ({ kind: 'invite' as const, data })),
  ...props.moves.map((data) => ({ kind: 'move' as const, data })),
])
const item = computed(() => items.value[0])

/** Open for anything not yet shown (or all of it, when asked). */
watch(
  [items, () => props.show],
  () => {
    if (open.value) return
    if (props.show ? items.value.length : items.value.some((i) => i.data.popup)) open.value = true
  },
  { immediate: true },
)

// Showing it counts as seeing it, so it doesn't pop up again.
watch(
  [open, item],
  () => {
    const i = item.value
    if (open.value && i?.data.popup) {
      api.promptSeen(i.kind === 'invite' ? 'guest_invitation' : 'account_move', i.data.id).catch(() => {})
      i.data.popup = false
    }
  },
  { immediate: true },
)
watch(open, (o) => {
  if (!o) emit('update:show', false)
})

async function answer(accept: boolean) {
  const i = item.value
  if (!i) return
  status.value = 'loading'
  try {
    if (i.kind === 'invite') {
      await api.respondToInvitation(i.data.id, accept)
      notify({
        type: 'success',
        title: accept ? t('prompts.accepted', { name: i.data.organisationName }) : t('prompts.declined'),
      })
    } else {
      await api.decideMove(i.data.toOrganisationId, i.data.id, accept ? 'accept' : 'decline')
      notify({
        type: 'success',
        title: accept ? t('moves.accepted', { name: i.data.name }) : t('moves.declined'),
        description: accept ? t('moves.acceptedDescription', { email: i.data.newEmail }) : undefined,
      })
    }
    emit('answered')
    if (items.value.length <= 1) open.value = false
  } catch (e) {
    notify({
      type: 'error',
      title: i.kind === 'invite' ? t('prompts.couldntAnswer') : t('moves.couldntDecide'),
      description: e instanceof Error ? e.message : String(e),
    })
  } finally {
    status.value = 'idle'
  }
}
</script>

<template>
  <Slideover
    v-if="item"
    v-model:open="open"
    side="right"
    :title="item.kind === 'invite' ? t('prompts.invitationTitle', { name: item.data.organisationName }) : t('prompts.moveTitle', { name: item.data.name })"
    :description="
      item.kind === 'invite'
        ? t('prompts.invitationDescription', { who: item.data.invitedByName, name: item.data.organisationName })
        : t('prompts.moveDescription', { from: item.data.fromOrganisationName, name: item.data.name, to: item.data.toOrganisationName })
    "
  >
    <template #body>
      <p v-if="item.kind === 'invite'" class="text-sm">
        {{ t('prompts.invitationBody', { name: item.data.organisationName, home: item.data.homeOrganisationName }) }}
      </p>
      <p v-else class="text-sm">{{ t('prompts.moveBody', { oldEmail: item.data.oldEmail, newEmail: item.data.newEmail }) }}</p>
      <p v-if="items.length > 1" class="mt-4 text-xs text-black/65">{{ t('prompts.moreWaiting', { count: items.length - 1 }) }}</p>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('prompts.later') }}</Button>
      <Button :disabled="status !== 'idle'" @click="answer(false)">{{ t('prompts.decline') }}</Button>
      <Button variant="primary" :status="status" @click="answer(true)">{{ t('prompts.accept') }}</Button>
    </template>
  </Slideover>
</template>
