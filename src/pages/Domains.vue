<script setup lang="ts">
import { Globe, Plus, TriangleAlert } from '@lucide/vue'
import { Badge, Button, Card, Checkbox, EmptyState, PageHeader, Slideover, Spinner, useNotifications } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AddDomainSlideover from '../components/AddDomainSlideover.vue'
import { api, type OrgDomain } from '../lib/api'

const { t } = useI18n()

/**
 * Settings → Domains: the domains this organisation's people's emails can
 * have. The primary one is the default; others are added, proven with a DNS
 * TXT record (or, for TKG Admins, by override), and can be made primary or
 * removed when nobody uses them.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const domains = ref<OrgDomain[]>()
const canOverride = ref(false)
const error = ref<string>()
const adding = ref(false)
const busy = ref<string>()

async function load() {
  try {
    const r = await api.domains(orgId)
    domains.value = r.domains
    canOverride.value = r.canOverride
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(load)

function fail(title: string, e: unknown) {
  notify({ type: 'error', title, description: e instanceof Error ? e.message : String(e) })
}

async function verify(d: OrgDomain) {
  busy.value = d.id
  try {
    await api.verifyDomain(orgId, d.id)
    notify({ type: 'success', title: t('domains.verified', { domain: d.domain }) })
    await load()
  } catch (e) {
    fail(t('domains.couldntVerify', { domain: d.domain }), e)
  } finally {
    busy.value = undefined
  }
}

// Make primary / remove ask first.
const primaryFor = ref<OrgDomain>()
const rename = ref(false)
const removeFor = ref<OrgDomain>()
const confirming = ref(false)

function askPrimary(d: OrgDomain) {
  rename.value = false
  primaryFor.value = d
}

async function makePrimary() {
  const d = primaryFor.value
  if (!d) return
  confirming.value = true
  try {
    await api.makePrimaryDomain(orgId, d.id, rename.value)
    notify({ type: 'success', title: t('domains.nowPrimary', { domain: d.domain }) })
    primaryFor.value = undefined
    await load()
  } catch (e) {
    fail(t('domains.couldntMakePrimary'), e)
  } finally {
    confirming.value = false
  }
}

async function remove() {
  const d = removeFor.value
  if (!d) return
  confirming.value = true
  try {
    await api.removeDomain(orgId, d.id)
    notify({ type: 'success', title: t('domains.removed', { domain: d.domain }) })
    removeFor.value = undefined
    await load()
  } catch (e) {
    fail(t('domains.couldntRemove'), e)
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('domains.title')"
      :description="t('domains.description')"
      :breadcrumb="[{ label: t('nav.settings'), icon: Globe }, { label: t('domains.title') }]"
      :actions="[{ label: t('domains.add'), icon: Plus, variant: 'primary', onSelect: () => (adding = true) }]"
    />
    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('domains.couldntLoad')" :description="error" /></Card>
    <div v-else-if="!domains" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <Card v-else>
      <ul class="flex flex-col divide-y divide-black/10">
        <li v-for="d in domains" :key="d.id" class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div class="flex flex-wrap items-center gap-2">
            <span :class="['min-w-0 break-all', d.primary && 'font-bold']">{{ d.domain }}</span>
            <Badge v-if="d.primary" color="primary" size="sm">{{ t('domains.primary') }}</Badge>
            <Badge v-if="d.verified" color="green" size="sm">{{ t('domains.statusVerified') }}</Badge>
            <Badge v-else color="yellow" size="sm">{{ t('domains.statusUnverified') }}</Badge>
            <Badge v-if="d.override" color="blue" size="sm">{{ t('domains.overrideBadge') }}</Badge>
            <span class="text-sm text-black/65">{{ t('domains.users', { count: d.userCount }, d.userCount) }}</span>
            <span class="flex-1" />
            <Button v-if="!d.verified" size="sm" :disabled="busy === d.id" @click="verify(d)">{{ t('domains.verify') }}</Button>
            <Button v-if="d.verified && !d.primary" size="sm" @click="askPrimary(d)">{{ t('domains.makePrimary') }}</Button>
            <Button v-if="!d.primary" size="sm" :disabled="d.userCount > 0" @click="removeFor = d">{{ t('domains.remove') }}</Button>
          </div>
          <p v-if="d.override" class="text-sm text-black/65">{{ t('domains.overrideBy', { name: d.verifiedByName || '—' }) }}</p>
          <div v-if="d.record" class="rounded-md bg-black/5 p-3 text-sm">
            <p>{{ t('domains.recordIntro', { domain: d.domain }) }}</p>
            <p class="mt-1 font-mono break-all select-all">{{ d.record.name }} TXT {{ d.record.value }}</p>
          </div>
        </li>
      </ul>
    </Card>

    <AddDomainSlideover v-model:open="adding" :org-id="orgId" :can-override="canOverride" @added="load" />

    <Slideover :open="!!primaryFor" :title="t('domains.makePrimaryTitle', { domain: primaryFor?.domain })" :description="t('domains.makePrimaryDescription')" @update:open="(o?: boolean) => !o && (primaryFor = undefined)">
      <template #body>
        <Checkbox v-model="rename" :label="t('domains.rename')" :description="t('domains.renameDescription', { domain: primaryFor?.domain })" />
      </template>
      <template #footer="{ close }">
        <Button :disabled="confirming" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :disabled="confirming" @click="makePrimary">{{ t('domains.makePrimary') }}</Button>
      </template>
    </Slideover>

    <Slideover :open="!!removeFor" :title="t('domains.removeTitle', { domain: removeFor?.domain })" :description="t('domains.removeDescription')" @update:open="(o?: boolean) => !o && (removeFor = undefined)">
      <template #footer="{ close }">
        <Button :disabled="confirming" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :disabled="confirming" @click="remove">{{ t('domains.remove') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
