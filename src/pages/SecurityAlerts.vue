<script setup lang="ts">
import { BellRing, ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Badge, Button, Card, EmptyState, PageHeader, RelativeTime, Spinner } from '@thekestongroup/ui'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type SecurityAlert } from '../lib/api'

/** Security → Alerts: recent security alerts for this organisation, with filters. */
const { t, te, locale } = useI18n()
const route = useRoute()
const orgId = route.params.orgId as string

const kinds = ['admin_added', 'admin_role_granted', 'mfa_off', 'password_policy_weakened', 'failed_sign_ins', 'account_locked', 'new_country']
const severities = ['critical', 'warning', 'info']
const kind = ref('')
const severity = ref('')
const items = ref<SecurityAlert[]>([])
const next = ref<string | null>(null)
const loading = ref(true)
const error = ref<string>()

async function load(more = false) {
  loading.value = true
  error.value = undefined
  const q = new URLSearchParams()
  if (kind.value) q.set('kind', kind.value)
  if (severity.value) q.set('severity', severity.value)
  if (more && next.value) q.set('before', next.value)
  try {
    const out = await api.securityAlerts(orgId, q.size ? `?${q}` : '')
    items.value = more ? [...items.value, ...out.items] : out.items
    next.value = out.next
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => load())
watch([kind, severity], () => load())

function country(code: string | number | undefined) {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'region' }).of(String(code)) ?? String(code)
  } catch {
    return String(code)
  }
}
const text = (a: SecurityAlert) => {
  const p = { ...a.params, name: a.subjectName, country: country(a.params.country) }
  return te(`securityAlerts.kinds.${a.kind}.text`) ? t(`securityAlerts.kinds.${a.kind}.text`, p) : a.body
}
const tone = (s: string) => (s === 'critical' ? 'danger' : s === 'warning' ? 'warning' : 'neutral')
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('securityAlerts.title')"
      :description="t('securityAlerts.description')"
      :breadcrumb="[{ label: t('nav.security'), icon: ShieldCheck }, { label: t('securityAlerts.title') }]"
    />
    <div class="flex flex-wrap gap-3">
      <label class="flex flex-col gap-1 text-sm">
        {{ t('securityAlerts.kind') }}
        <select v-model="kind" class="rounded-md border border-border bg-background px-2 py-1.5">
          <option value="">{{ t('securityAlerts.allKinds') }}</option>
          <option v-for="k in kinds" :key="k" :value="k">{{ t(`securityAlerts.kinds.${k}.label`) }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {{ t('securityAlerts.severity') }}
        <select v-model="severity" class="rounded-md border border-border bg-background px-2 py-1.5">
          <option value="">{{ t('securityAlerts.allSeverities') }}</option>
          <option v-for="s in severities" :key="s" :value="s">{{ t(`securityAlerts.severities.${s}`) }}</option>
        </select>
      </label>
    </div>
    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('securityAlerts.couldntLoad')" :description="error" /></Card>
    <div v-else-if="loading && !items.length" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <Card v-else-if="!items.length"><EmptyState :icon="BellRing" :title="t('securityAlerts.none')" :description="t('securityAlerts.noneDescription')" /></Card>
    <template v-else>
      <ul class="flex flex-col gap-3">
        <li v-for="a in items" :key="a.id">
          <Card>
            <div class="flex flex-wrap items-center gap-2">
              <Badge :variant="tone(a.severity)">{{ t(`securityAlerts.severities.${a.severity}`) }}</Badge>
              <span class="font-medium">{{ t(`securityAlerts.kinds.${a.kind}.label`) }}</span>
              <RelativeTime :date="a.createdAt" class="ml-auto text-sm text-muted-foreground" />
            </div>
            <p class="mt-1 text-sm">{{ text(a) }}</p>
          </Card>
        </li>
      </ul>
      <div v-if="next"><Button variant="basic" :disabled="loading" @click="load(true)">{{ t('securityAlerts.more') }}</Button></div>
    </template>
  </div>
</template>
