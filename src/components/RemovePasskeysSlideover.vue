<script setup lang="ts">
import { Button, type ButtonStatus, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref } from 'vue'
import { api, type User } from '../lib/api'

/**
 * Removing all of a user's passkeys and security keys, e.g. when one's been
 * lost or stolen. An authenticator app, if they have one, stays on.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ orgId: string; user: User }>()
const emit = defineEmits<{ removed: [user: User] }>()
const { notify } = useNotifications()
const status = ref<ButtonStatus>('idle')

async function remove() {
  status.value = 'loading'
  try {
    const updated = await api.removePasskeys(props.orgId, props.user.id)
    emit('removed', updated)
    open.value = false
    notify({
      type: 'success',
      title: 'Passkeys removed',
      description: updated.mfa
        ? `${props.user.name} uses their authenticator app after their password now.`
        : `${props.user.name} can sign in with their password now, and add passkeys again in their Keston account.`,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t remove their passkeys', description: e instanceof Error ? e.message : String(e) })
  } finally {
    status.value = 'idle'
  }
}
</script>

<template>
  <Slideover
    v-model:open="open"
    :title="`Remove ${user.name}’s passkeys?`"
    :description="`All ${user.passkeys === 1 ? '1 passkey' : `${user.passkeys} passkeys`} and security keys on their account stop working. Only do this once you’re sure it’s really them asking, e.g. they’ve lost a device.`"
  >
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">Cancel</Button>
      <Button variant="danger" :status="status" loading-text="Removing" @click="remove">Remove passkeys</Button>
    </template>
  </Slideover>
</template>
