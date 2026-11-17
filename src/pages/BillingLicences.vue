<script setup lang="ts">
import { PageHeader, Spinner } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LicenceAllocationsCard from '../components/LicenceAllocationsCard.vue'
import { loadMe, type Me } from '../lib/api'

const { t } = useI18n()

/**
 * Billing > Licences: how many licences the organisation has for each Keston
 * product, and how many are in use. TKG Admins edit them for any
 * organisation, with or without support access (only counts are shown, never
 * people). The organisation's own admins see them read-only.
 */
const orgId = useRoute().params.orgId as string
const me = ref<Me>()
onMounted(async () => {
  me.value = await loadMe().catch(() => undefined)
})
</script>

<template>
  <div class="flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('billing.licences.title')" :description="t('billing.licences.description')" />
    <div v-if="!me" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <LicenceAllocationsCard :org-id="orgId" :can-edit="me.platformAdmin" />
      <p v-if="!me.platformAdmin" class="text-sm text-black/65">{{ t('billing.licences.kestonManages') }}</p>
    </template>
  </div>
</template>
