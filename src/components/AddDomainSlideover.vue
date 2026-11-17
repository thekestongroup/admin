<script setup lang="ts">
import { Copy } from '@lucide/vue'
import { Button, type ButtonStatus, Checkbox, Input, Slideover, useNotifications } from '@thekestongroup/ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type OrgDomain } from '../lib/api'

const { t } = useI18n()

/**
 * Adding a domain: type it, then it shows the TXT record to create at the
 * DNS host (Verify is on the list). TKG Admins can instead add it already
 * verified, without DNS (an override, recorded as such).
 */
const props = defineProps<{ orgId: string; canOverride: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()
const { notify } = useNotifications()

const domain = ref('')
const override = ref(false)
const error = ref<string>()
const status = ref<ButtonStatus>('idle')
const added = ref<OrgDomain>()

watch(open, (o) => {
  if (!o) return
  domain.value = ''
  override.value = false
  error.value = undefined
  status.value = 'idle'
  added.value = undefined
})

async function add() {
  error.value = domain.value.trim() ? undefined : t('domains.enterDomain')
  if (error.value) return
  status.value = 'loading'
  try {
    const d = await api.addDomain(props.orgId, domain.value.trim(), override.value)
    status.value = 'idle'
    emit('added')
    if (d.verified) {
      notify({ type: 'success', title: t('domains.addedVerified', { domain: d.domain }) })
      open.value = false
    } else {
      added.value = d
    }
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'domain') error.value = e.message
    else notify({ type: 'error', title: t('domains.couldntAdd'), description: e instanceof Error ? e.message : String(e) })
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify({ type: 'success', title: t('domains.copied') })
  } catch {
    notify({ type: 'error', title: t('domains.couldntCopy') })
  }
}
</script>

<template>
  <Slideover v-model:open="open" :title="t('domains.add')" :description="added ? t('domains.recordDescription') : t('domains.addDescription')" initial-focus="auto">
    <template #body>
      <div v-if="added?.record" class="flex flex-col gap-4">
        <p class="text-sm">{{ t('domains.recordIntro', { domain: added.domain }) }}</p>
        <dl class="flex flex-col gap-3 text-sm">
          <div v-for="row in [
            { label: t('domains.recordType'), value: 'TXT', copy: false },
            { label: t('domains.recordName'), value: added.record.name, copy: true },
            { label: t('domains.recordValue'), value: added.record.value, copy: true },
          ]" :key="row.label" class="flex items-center gap-2">
            <dt class="w-16 shrink-0 font-bold">{{ row.label }}</dt>
            <dd class="min-w-0 flex-1 break-all font-mono select-all">{{ row.value }}</dd>
            <Button v-if="row.copy" size="sm" :icon="Copy" :aria-label="t('domains.copy', { what: row.label })" @click="copy(row.value)" />
          </div>
        </dl>
        <p class="text-sm text-black/65">{{ t('domains.recordApex', { domain: added.domain }) }}</p>
        <p class="text-sm text-black/65">{{ t('domains.recordWait') }}</p>
      </div>
      <form v-else id="add-domain" class="flex flex-col gap-4" novalidate @submit.prevent="add">
        <Input v-model="domain" :label="t('domains.domain')" :placeholder="t('domains.placeholder')" autocapitalize="off" spellcheck="false" :error-text="error" />
        <Checkbox v-if="canOverride" v-model="override" :label="t('domains.override')" :description="t('domains.overrideDescription')" />
      </form>
    </template>
    <template #footer="{ close }">
      <template v-if="added"><Button variant="primary" @click="close">{{ t('common.done') }}</Button></template>
      <template v-else>
        <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="add-domain" variant="primary" :status="status" :loading-text="t('domains.adding')">{{ t('domains.add') }}</Button>
      </template>
    </template>
  </Slideover>
</template>
