<script setup lang="ts">
import { ArrowRightLeft } from '@lucide/vue'
import { Button, Card, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { api, type AccountMove } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Pending requests to move accounts into or out of this organisation (Users
 * page), for its global admins: accept or decline the ones coming in, cancel
 * the ones it asked for.
 */
const props = defineProps<{ orgId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { notify } = useNotifications()

const moves = ref<AccountMove[]>([])
const busy = ref<string>()
async function load() {
  moves.value = await api.moves(props.orgId).catch(() => [])
}
onMounted(load)
defineExpose({ load })

const pending = computed(() => moves.value.filter((m) => m.status === 'pending'))

async function decide(m: AccountMove, decision: 'accept' | 'decline' | 'cancel') {
  busy.value = m.id
  try {
    await api.decideMove(props.orgId, m.id, decision)
    notify({
      type: 'success',
      title: decision === 'accept' ? t('moves.accepted', { name: m.name }) : decision === 'decline' ? t('moves.declined') : t('moves.cancelled'),
      description: decision === 'accept' ? t('moves.acceptedDescription', { email: m.newEmail }) : undefined,
    })
    await load()
    emit('changed')
  } catch (e) {
    notify({ type: 'error', title: t('moves.couldntDecide'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <Card v-if="pending.length" :title="t('moves.title')" :description="t('moves.description')">
    <ul class="flex flex-col gap-3">
      <li v-for="m in pending" :key="m.id" class="flex flex-wrap items-center gap-3">
        <ArrowRightLeft class="size-4 shrink-0 text-blue" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm">
          <span class="font-bold">{{ m.toOrganisationId === orgId ? t('moves.incoming', { name: m.name, to: m.toOrganisationName, from: m.fromOrganisationName }) : t('moves.outgoing', { name: m.name, to: m.toOrganisationName }) }}</span>
          <br />
          {{ m.toOrganisationId === orgId
            ? t('moves.incomingText', { from: m.fromOrganisationName, name: m.name, oldEmail: m.oldEmail, newEmail: m.newEmail })
            : t('moves.outgoingText', { to: m.toOrganisationName, oldEmail: m.oldEmail, newEmail: m.newEmail }) }}
        </p>
        <template v-if="m.toOrganisationId === orgId">
          <Button size="sm" :disabled="busy === m.id" @click="decide(m, 'decline')">{{ t('moves.decline') }}</Button>
          <Button size="sm" variant="primary" :disabled="busy === m.id" @click="decide(m, 'accept')">{{ t('moves.accept') }}</Button>
        </template>
        <Button v-else size="sm" :disabled="busy === m.id" @click="decide(m, 'cancel')">{{ t('moves.cancel') }}</Button>
      </li>
    </ul>
  </Card>
</template>
