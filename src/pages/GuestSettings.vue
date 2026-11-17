<script setup lang="ts">
import { ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Card, EmptyState, PageHeader, Spinner, Switch, type SwitchProps, useNotifications } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Security → Guests: whether this organisation's people can be guests in
 * other organisations. Off by default; invitations only reach people whose
 * organisation has it on.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const allow = ref<boolean>()
const error = ref<string>()
const saving = ref<{ status?: SwitchProps['status']; text?: string }>({})
onMounted(async () => {
  try {
    allow.value = (await api.guestSettings(orgId)).allowGuests
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

async function save(on: boolean) {
  saving.value = { status: 'loading', text: t('guestSettings.saving') }
  try {
    allow.value = (await api.setGuestSettings(orgId, on)).allowGuests
    saving.value = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (saving.value.status === 'success') saving.value = {}
    }, 2000)
  } catch (e) {
    saving.value = { status: 'error', text: t('guestSettings.couldntSave') }
    notify({ type: 'error', title: t('guestSettings.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('guestSettings.title')"
      :description="t('guestSettings.description')"
      :breadcrumb="[{ label: t('nav.security'), icon: ShieldCheck }, { label: t('guestSettings.title') }]"
    />
    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('guestSettings.couldntLoad')" :description="error" /></Card>
    <div v-else-if="allow === undefined" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <Card v-else>
      <Switch
        :model-value="allow"
        :label="t('guestSettings.allow')"
        :description="t('guestSettings.allowDescription')"
        :status="saving.status"
        :status-text="saving.text"
        @update:model-value="save"
      />
    </Card>
  </div>
</template>
