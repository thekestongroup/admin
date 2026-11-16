<script setup lang="ts">
import { Button, type ButtonStatus, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref } from 'vue'
import { api, type User } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
      title: t('passkeys.removed'),
      description: updated.mfa
        ? t('passkeys.removedWithApp', { name: props.user.name })
        : t('passkeys.removedNoApp', { name: props.user.name }),
    })
  } catch (e) {
    notify({ type: 'error', title: t('passkeys.couldntRemove'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    status.value = 'idle'
  }
}
</script>

<template>
  <Slideover
    v-model:open="open"
    :title="t('passkeys.title', { name: user.name })"
    :description="t('passkeys.description', user.passkeys)"
  >
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="danger" :status="status" :loading-text="t('passkeys.removing')" @click="remove">{{ t('passkeys.remove') }}</Button>
    </template>
  </Slideover>
</template>
