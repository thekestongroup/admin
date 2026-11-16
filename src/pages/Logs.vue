<script setup lang="ts">
import { ScrollText, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InputDate,
  Link,
  PageHeader,
  RelativeTime,
  Select,
  Table,
  type TableColumn,
} from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, type Organisation, type User } from '../lib/api'

type SelectOption = { label: string; value: string; description?: string }
import {
  type AuditEntry,
  type SignInEntry,
  actionGroups,
  actionLabel,
  device,
  logsApi,
  methodLabel,
  reasonLabel,
  reasonOptions as reasonFilterOptions,
} from '../lib/logs'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

/**
 * Logs: what admins did here (Admin actions) and every sign-in attempt
 * (Sign-ins), for the last year. The view and filters are in the URL, so
 * other pages can link to them (e.g. a user's activity).
 */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : undefined)
const view = computed(() => (q('view') === 'sign-ins' ? 'sign-ins' : 'actions'))
const ALL = 'all'
/** The filters, as in the URL (actions: any of these; none, every action). */
const fromQuery = () => ({
  user: q('user') ?? ALL,
  action: q('action')?.split(',').filter(Boolean) ?? [],
  result: q('result') ?? ALL,
  reason: q('reason') ?? ALL,
  from: q('from'),
  to: q('to'),
})
const filters = ref(fromQuery())
const filtered = computed(() => ['user', 'action', 'result', 'reason', 'from', 'to'].some((k) => q(k)))

/** Filters change the URL (and so reload the page's entries). */
function apply(changes: Partial<Record<'user' | 'action' | 'result' | 'reason' | 'from' | 'to' | 'view', string>>) {
  const next: Record<string, unknown> = { ...route.query, ...changes }
  for (const [k, v] of Object.entries(next)) if (v === ALL || v === undefined || v === '') delete next[k]
  router.replace({ query: next as typeof route.query })
}

function clear() {
  router.replace({ query: view.value === 'sign-ins' ? { view: 'sign-ins' } : {} })
}

const org = ref<Organisation>()
const users = ref<User[]>([])
const actions = ref<AuditEntry[]>([])
const signIns = ref<SignInEntry[]>([])
const next = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string>()

// Only the latest load's entries are shown (filters can change quickly).
let latest = 0
async function load(before?: string) {
  const n = ++latest
  const f = filters.value
  const opt = (v: string | undefined) => (v === ALL ? undefined : v)
  const common = { user: opt(f.user), from: f.from, to: f.to, before }
  if (view.value === 'actions') {
    const page = await logsApi.auditLog(orgId, { ...common, action: f.action.length ? f.action.join(',') : undefined })
    if (n !== latest) return
    actions.value = before ? [...actions.value, ...page.entries] : page.entries
    next.value = page.next
  } else {
    const page = await logsApi.signIns(orgId, {
      ...common,
      result: opt(f.result) as 'success' | 'failure' | undefined,
      reason: opt(f.reason),
    })
    if (n !== latest) return
    signIns.value = before ? [...signIns.value, ...page.entries] : page.entries
    next.value = page.next
  }
}

onMounted(async () => {
  try {
    org.value = await api.organisation(orgId)
    // Filtering by user needs seeing the users.
    if (org.value.permissions?.includes('users.view')) users.value = await api.users(orgId).catch(() => [])
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    loading.value = false
  }
})

// The page stays put when the URL's filters change (so fields keep what's
// being typed); the entries reload.
watch(
  () => route.query,
  async () => {
    filters.value = fromQuery()
    loading.value = true
    try {
      await load()
      error.value = undefined
    } catch (e) {
      error.value = message(e)
    } finally {
      loading.value = false
    }
  },
)

async function more() {
  loadingMore.value = true
  try {
    await load(next.value!)
  } catch (e) {
    error.value = message(e)
  } finally {
    loadingMore.value = false
  }
}

// ── Filters ─────────────────────────────────────────────────────────────

const userOptions = computed<SelectOption[]>(() => [
  { label: t('logs.everyone'), value: ALL },
  ...users.value.map((u) => ({ label: u.name, value: u.id, description: u.email })),
])
const actionOptions = computed(() => [
  ...actionGroups().map((g) => ({
    label: g.label,
    options: Object.entries(g.actions).map(([value, label]) => ({ label, value })),
  })),
])
const resultOptions = computed<SelectOption[]>(() => [
  { label: t('logs.result.all'), value: ALL },
  { label: t('logs.result.success'), value: 'success' },
  { label: t('logs.result.failure'), value: 'failure' },
])
const reasonOptions = computed<SelectOption[]>(() => [{ label: t('logs.anyReason'), value: ALL }, ...reasonFilterOptions()])

// ── Tables ──────────────────────────────────────────────────────────────

const actionColumns = computed<TableColumn<AuditEntry>[]>(() => [
  { key: 'createdAt', label: t('logs.columns.when') },
  { key: 'actorName', label: t('logs.columns.who') },
  { key: 'action', label: t('logs.columns.what'), rowHeader: true },
  { key: 'summary', label: t('logs.columns.details') },
  { key: 'ip', label: t('logs.columns.ip') },
])
const signInColumns = computed<TableColumn<SignInEntry>[]>(() => [
  { key: 'createdAt', label: t('logs.columns.when') },
  { key: 'userName', label: t('logs.columns.user'), rowHeader: true },
  { key: 'method', label: t('logs.columns.how') },
  { key: 'clientName', label: t('logs.columns.app') },
  { key: 'success', label: t('logs.columns.result') },
  { key: 'ip', label: t('logs.columns.whereFrom') },
])

const userLink = (id: string | null) => (id && users.value.some((u) => u.id === id) ? `/organisations/${orgId}/users/${id}` : undefined)
/** Switching tabs keeps the filters both have: user and dates. */
const tabQuery = (v: string) => {
  const keep: Record<string, string> = {}
  for (const k of ['user', 'from', 'to']) if (q(k)) keep[k] = q(k)!
  return v === 'sign-ins' ? { ...keep, view: 'sign-ins' } : keep
}
const tabs = computed(() => [
  { view: 'actions', label: t('logs.tabs.actions') },
  { view: 'sign-ins', label: t('logs.tabs.signIns') },
])
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('logs.title')" :description="t('logs.description')">
      <nav :aria-label="t('logs.title')" class="flex gap-6 border-b border-black/15">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.view"
          :to="{ query: tabQuery(tab.view) }"
          :aria-current="view === tab.view ? 'page' : undefined"
          class="-mb-px border-b-2 pb-2 text-sm font-bold"
          :class="view === tab.view ? 'border-primary text-black' : 'border-transparent text-black/65 hover:text-black'"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>
    </PageHeader>

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('logs.couldntLoad')" :description="error" />
    </Card>
    <template v-else>
      <Card>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            v-if="users.length"
            v-model="filters.user"
            :label="t('logs.columns.user')"
            searchable
            :options="userOptions"
            @update:model-value="apply({ user: String($event ?? ALL) })"
          />
          <Select
            v-if="view === 'actions'"
            v-model="filters.action"
            :label="t('logs.actions.label')"
            :placeholder="t('logs.everyAction')"
            searchable
            multiple
            :groups="actionOptions"
            @update:model-value="apply({ action: (($event as string[] | undefined) ?? []).join(',') })"
          />
          <template v-else>
            <Select v-model="filters.result" :label="t('logs.columns.result')" :options="resultOptions" @update:model-value="apply({ result: String($event) })" />
            <Select v-model="filters.reason" :label="t('logs.whyFailed')" :options="reasonOptions" @update:model-value="apply({ reason: String($event) })" />
          </template>
          <InputDate v-model="filters.from" :label="t('logs.from')" prefer="past" :locale="locale" @update:model-value="apply({ from: $event })" />
          <InputDate v-model="filters.to" :label="t('logs.to')" prefer="past" :locale="locale" @update:model-value="apply({ to: $event })" />
        </div>
        <div v-if="filtered" class="mt-4">
          <Button size="sm" variant="ghost" @click="clear">{{ t('logs.clearFilters') }}</Button>
        </div>
      </Card>

      <Card padding="none">
        <Table
          v-if="view === 'actions'"
          :columns="actionColumns"
          :rows="actions"
          row-key="id"
          :loading="loading"
          :caption="t('logs.tabs.actions')"
          size="sm"
        >
          <template #cell-createdAt="{ row }"><RelativeTime :date="row.createdAt" class="whitespace-nowrap" /></template>
          <template #cell-actorName="{ row }">
            <Link v-if="userLink(row.actorId)" :as="RouterLink" :to="userLink(row.actorId)!">{{ row.actorName }}</Link>
            <span v-else>{{ row.actorName }}</span>
            <span v-if="row.supportStaffName" class="block text-xs text-black/65">{{ t('logs.kestonSupport', { name: row.supportStaffName }) }}</span>
          </template>
          <template #cell-action="{ row }">
            {{ actionLabel(row.action) }}
            <span v-if="row.targetName && row.targetType !== 'organisation'" class="block text-xs text-black/65">
              <Link v-if="row.targetType === 'user' && userLink(row.targetId)" :as="RouterLink" :to="userLink(row.targetId)!">{{ row.targetName }}</Link>
              <template v-else>{{ row.targetName }}</template>
            </span>
          </template>
          <template #cell-summary="{ row }"><span class="text-black/80">{{ row.summary }}</span></template>
          <template #empty>
            <EmptyState
              size="sm"
              :icon="ScrollText"
              :title="filtered ? t('logs.noMatch') : t('logs.noActions')"
              :description="t('logs.noActionsDescription')"
              class="p-0"
            />
          </template>
        </Table>
        <Table v-else :columns="signInColumns" :rows="signIns" row-key="id" :loading="loading" :caption="t('logs.tabs.signIns')" size="sm">
          <template #cell-createdAt="{ row }"><RelativeTime :date="row.createdAt" class="whitespace-nowrap" /></template>
          <template #cell-userName="{ row }">
            <Link v-if="userLink(row.userId)" :as="RouterLink" :to="userLink(row.userId)!">{{ row.userName }}</Link>
            <span v-else>{{ row.userName || row.email }}</span>
            <span v-if="row.userName" class="block text-xs text-black/65">{{ row.email }}</span>
            <span v-if="row.supportStaffName" class="block text-xs text-black/65">{{ t('logs.kestonSupport', { name: row.supportStaffName }) }}</span>
          </template>
          <template #cell-method="{ row }">{{ methodLabel(row.method) }}</template>
          <template #cell-clientName="{ row }">{{ row.clientName ?? t('logs.kestonId') }}</template>
          <template #cell-success="{ row }">
            <Badge v-if="row.success" color="green" size="sm">{{ t('logs.signedIn') }}</Badge>
            <Badge v-else color="red" size="sm">{{ reasonLabel(row.reason) }}</Badge>
          </template>
          <template #cell-ip="{ row }">
            {{ row.ip }}
            <span v-if="device(row.userAgent)" class="block text-xs text-black/65" :title="row.userAgent">{{ device(row.userAgent) }}</span>
          </template>
          <template #empty>
            <EmptyState
              size="sm"
              :icon="ScrollText"
              :title="filtered ? t('logs.noMatch') : t('logs.noSignIns')"
              :description="t('logs.noSignInsDescription')"
              class="p-0"
            />
          </template>
        </Table>
      </Card>

      <div v-if="next" class="flex justify-center">
        <Button :status="loadingMore ? 'loading' : 'idle'" :loading-text="t('common.loading')" @click="more">{{ t('logs.showOlder') }}</Button>
      </div>
    </template>
  </div>
</template>
