<script setup lang="ts">
import {
  AppWindow,
  CalendarX,
  CircleCheck,
  KeyRound,
  Lock,
  Gauge,
  LogIn,
  Plus,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
  UsersRound,
} from '@lucide/vue'
import { Button, Card, EmptyState, Link, RelativeTime, Spinner, StatTile, formatDate } from '@thekestongroup/ui'
import { computed, onMounted, ref, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { type Organisation, type OrganisationSummary, type SecurityDefaults, type PermissionId, api } from '../lib/api'
import { actionLabel } from '../lib/logs'

/**
 * An organisation's dashboard: the numbers that matter as tiles (each linking
 * to the list behind it, filtered), what needs attention, the latest admin
 * activity, sign-ins this week and quick actions. One request (GET …/summary)
 * gives all the counts; links only appear for what you can open.
 */
const props = defineProps<{ org: Organisation }>()
const { t, n, locale } = useI18n()

const base = computed(() => `/organisations/${props.org.id}`)
const has = (p: PermissionId) => !!props.org.permissions?.includes(p)

const summary = ref<OrganisationSummary>()
const error = ref<string>()
const security = ref<SecurityDefaults>()
onMounted(async () => {
  if (has('policy.manage')) api.securityDefaults(props.org.id).then((v) => (security.value = v), () => {})
  try {
    summary.value = await api.summary(props.org.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

type Dest = { path: string; query?: Record<string, string> }
const signInsFrom = computed(() => summary.value?.signIns.daily[0]?.date ?? '')

// ── Tiles ───────────────────────────────────────────────────────────────────

type Tile = {
  key: string
  label: string
  value: string
  description: string
  icon: Component
  to?: Dest
}

const tiles = computed<Tile[]>(() => {
  const s = summary.value
  if (!s) return []
  const users = has('users.view')
  const logs = has('reports.view')
  const percent = s.mfa.eligible ? Math.round((s.mfa.enrolled / s.mfa.eligible) * 100) : undefined
  const list: Tile[] = [
    {
      key: 'users',
      label: t('dashboard.users'),
      value: n(s.users.total),
      description: t('dashboard.usersBreakdown', { active: n(s.users.active), disabled: n(s.users.disabled) }),
      icon: Users,
      to: users ? { path: `${base.value}/users` } : undefined,
    },
    {
      key: 'groups',
      label: t('dashboard.groups'),
      value: n(s.groups),
      description: s.groups ? t('dashboard.groupsDescription') : t('dashboard.noGroups'),
      icon: UsersRound,
      to: users ? { path: `${base.value}/groups` } : undefined,
    },
    {
      key: 'apps',
      label: t('dashboard.apps'),
      value: n(s.apps.enabled),
      description: t('dashboard.appsDescription', { available: n(s.apps.available) }),
      icon: AppWindow,
      to: has('apps.manage') ? { path: `${base.value}/apps` } : undefined,
    },
    {
      key: 'licences',
      label: t('dashboard.licences'),
      value: n(s.licences.inUse),
      description: s.licences.inUse
        ? t('dashboard.licencesDescription', { count: n(s.licences.licensedUsers) }, s.licences.licensedUsers)
        : t('dashboard.noLicences'),
      icon: KeyRound,
      to: users ? { path: `${base.value}/users` } : undefined,
    },
    {
      key: 'mfa',
      label: t('dashboard.mfa'),
      value: percent === undefined ? '–' : `${percent}%`,
      description:
        percent === undefined
          ? t('dashboard.noActiveUsers')
          : t('dashboard.mfaDescription', { enrolled: n(s.mfa.enrolled), total: n(s.mfa.eligible) }),
      icon: ShieldCheck,
      to: users ? { path: `${base.value}/users`, query: { mfa: 'off', status: 'active,locked' } } : undefined,
    },
    ...(security.value
      ? [
          {
            key: 'secureScore',
            label: t('dashboard.secureScore'),
            value: `${security.value.score}%`,
            description: t('dashboard.secureScoreDescription', { done: security.value.done, total: security.value.total }),
            icon: Gauge,
            to: { path: `${base.value}/security/defaults` },
          } as Tile,
        ]
      : []),
    {
      key: 'signIns',
      label: t('dashboard.signIns'),
      value: n(s.signIns.total),
      description: s.signIns.total ? t('dashboard.last7Days') : t('dashboard.noSignIns'),
      icon: LogIn,
      to: logs ? { path: `${base.value}/logs`, query: { view: 'sign-ins', from: signInsFrom.value } } : undefined,
    },
    {
      key: 'failed',
      label: t('dashboard.failedSignIns'),
      value: n(s.signIns.failed),
      description: s.signIns.failed ? t('dashboard.last7Days') : t('dashboard.noFailedSignIns'),
      icon: TriangleAlert,
      to: logs ? { path: `${base.value}/logs`, query: { view: 'sign-ins', result: 'failure', from: signInsFrom.value } } : undefined,
    },
    {
      key: 'locked',
      label: t('dashboard.lockedAccounts'),
      value: n(s.users.locked),
      description: s.users.locked ? t('dashboard.lockedDescription') : t('dashboard.noLocked'),
      icon: Lock,
      to: users ? { path: `${base.value}/users`, query: { status: 'locked' } } : undefined,
    },
  ]
  return list
})

// ── Needs attention ─────────────────────────────────────────────────────────

type Item = { key: string; icon: Component; text: string; to?: Dest }

const attention = computed<Item[]>(() => {
  const s = summary.value
  const items: Item[] = []
  if (!s) return items
  const users = has('users.view')
  if (!props.org.verified) {
    items.push({ key: 'verify', icon: ShieldAlert, text: t('dashboard.attention.unverified') })
  }
  if (props.org.deleteAfter) {
    items.push({ key: 'deletion', icon: CalendarX, text: t('dashboard.attention.deletion', { date: formatDate(props.org.deleteAfter) }) })
  }
  if (s.users.locked > 0) {
    items.push({
      key: 'locked',
      icon: Lock,
      text: t('dashboard.attention.locked', { count: n(s.users.locked) }, s.users.locked),
      to: users ? { path: `${base.value}/users`, query: { status: 'locked' } } : undefined,
    })
  }
  const without = s.mfa.eligible - s.mfa.enrolled
  if (s.mfa.mode !== 'off' && without > 0) {
    items.push({
      key: 'mfa',
      icon: ShieldCheck,
      text: t('dashboard.attention.noMfa', { count: n(without) }, without),
      to: users ? { path: `${base.value}/users`, query: { mfa: 'off', status: 'active,locked' } } : undefined,
    })
  }
  if (s.users.passwordChangeRequired > 0) {
    items.push({
      key: 'password',
      icon: KeyRound,
      text: t('dashboard.attention.passwordChange', { count: n(s.users.passwordChangeRequired) }, s.users.passwordChangeRequired),
      to: users ? { path: `${base.value}/users` } : undefined,
    })
  }
  if (s.licences.unlicensed > 0) {
    items.push({
      key: 'notLicensed',
      icon: KeyRound,
      text: t('dashboard.attention.notLicensed', { count: n(s.licences.unlicensed) }, s.licences.unlicensed),
      to: users ? { path: `${base.value}/groups` } : undefined,
    })
  }
  return items
})

// ── Sign-ins this week ──────────────────────────────────────────────────────

const days = computed(() => {
  const daily = summary.value?.signIns.daily ?? []
  const max = Math.max(1, ...daily.map((d) => d.success + d.failed))
  const date = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(locale.value, { ...opts, timeZone: 'UTC' })
  return daily.map((d) => ({
    ...d,
    total: d.success + d.failed,
    // Heights as a share of the busiest day; a day with any sign-ins is always visible.
    successPercent: d.success ? Math.max(4, (d.success / max) * 100) : 0,
    failedPercent: d.failed ? Math.max(4, (d.failed / max) * 100) : 0,
    label: date(d.date, { weekday: 'short' }),
    full: date(d.date, { weekday: 'long', day: 'numeric', month: 'long' }),
  }))
})

// ── Quick actions ───────────────────────────────────────────────────────────

type Action = { key: string; label: string; icon: Component; to: Dest }
const actions = computed(() => {
  const out: Action[] = []
  if (has('users.create')) out.push({ key: 'user', label: t('dashboard.actions.addUser'), icon: UserPlus, to: { path: `${base.value}/users`, query: { add: '1' } } })
  if (has('groups.manage')) out.push({ key: 'group', label: t('dashboard.actions.newGroup'), icon: Plus, to: { path: `${base.value}/groups`, query: { new: '1' } } })
  if (has('apps.manage')) out.push({ key: 'app', label: t('dashboard.actions.addApp'), icon: AppWindow, to: { path: `${base.value}/apps/new` } })
  return out
})

const recentDetail = (a: { targetName: string; actorName: string }) =>
  [a.targetName, t('dashboard.activity.by', { name: a.actorName })].filter(Boolean).join(' · ')
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('dashboard.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!summary" class="flex justify-center py-8"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <!-- Stat tiles: fewer columns on narrower screens. -->
      <ul class="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-2 xl:grid-cols-4" :aria-label="t('dashboard.overview')">
        <li v-for="tile in tiles" :key="tile.key" class="min-w-0">
          <component
            :is="tile.to ? RouterLink : 'div'"
            :to="tile.to"
            class="group block h-full rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <StatTile
              :label="tile.label"
              :value="tile.value"
              :description="tile.description"
              :icon="tile.icon"
              class="h-full transition-[border-color,box-shadow] duration-150"
              :class="tile.to ? 'group-hover:border-black/40 group-hover:shadow-md' : ''"
            />
          </component>
        </li>
      </ul>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card :title="t('dashboard.attention.title')" :description="t('dashboard.attention.description')">
          <ul v-if="attention.length" class="flex flex-col divide-y divide-black/10">
            <li v-for="item in attention" :key="item.key" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0">
              <component :is="item.icon" class="size-4 shrink-0 text-black/65" aria-hidden="true" />
              <span class="min-w-0 flex-1">{{ item.text }}</span>
              <Link v-if="item.to" :as="RouterLink" :to="item.to">{{ t('dashboard.attention.review') }}</Link>
            </li>
          </ul>
          <div v-else class="flex items-center gap-2 text-sm" role="status">
            <CircleCheck class="size-5 shrink-0 text-green" aria-hidden="true" />
            {{ t('dashboard.attention.nothing') }}
          </div>
        </Card>

        <Card :title="t('dashboard.signInsWeek.title')" :description="t('dashboard.signInsWeek.description')">
          <p v-if="!summary.signIns.total" class="text-sm text-black/65">{{ t('dashboard.signInsWeek.none') }}</p>
          <figure v-else class="flex flex-col gap-2">
            <div class="flex h-32 items-end gap-2" aria-hidden="true">
              <div
                v-for="d in days"
                :key="d.date"
                class="flex h-full min-w-0 flex-1 flex-col justify-end"
                :title="`${d.full}: ${t('dashboard.signInsWeek.day', { success: d.success, failed: d.failed })}`"
              >
                <div v-if="d.failed" class="w-full rounded-t-sm bg-red" :style="{ height: `${d.failedPercent}%` }" />
                <div v-if="d.success" class="w-full bg-primary" :class="d.failed ? '' : 'rounded-t-sm'" :style="{ height: `${d.successPercent}%` }" />
                <div v-if="!d.total" class="h-px w-full bg-black/25" />
              </div>
            </div>
            <div class="flex gap-2 text-xs text-black/65" aria-hidden="true">
              <span v-for="d in days" :key="d.date" class="min-w-0 flex-1 text-center">{{ d.label }}</span>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/65" aria-hidden="true">
              <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary" />{{ t('dashboard.signInsWeek.succeeded') }}</span>
              <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-red" />{{ t('dashboard.signInsWeek.failed') }}</span>
            </div>
            <!-- The same numbers as text, for screen readers. -->
            <table class="sr-only">
              <caption>{{ t('dashboard.signInsWeek.title') }}</caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('dashboard.signInsWeek.date') }}</th>
                  <th scope="col">{{ t('dashboard.signInsWeek.succeeded') }}</th>
                  <th scope="col">{{ t('dashboard.signInsWeek.failed') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in days" :key="d.date">
                  <th scope="row">{{ d.full }}</th>
                  <td>{{ d.success }}</td>
                  <td>{{ d.failed }}</td>
                </tr>
              </tbody>
            </table>
          </figure>
        </Card>

        <Card v-if="summary.recentActivity" :title="t('dashboard.activity.title')" :description="t('dashboard.activity.description')">
          <p v-if="!summary.recentActivity.length" class="text-sm text-black/65">{{ t('dashboard.activity.none') }}</p>
          <ul v-else class="flex flex-col divide-y divide-black/10">
            <li v-for="a in summary.recentActivity" :key="a.id" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm first:pt-0">
              <span class="font-bold">{{ actionLabel(a.action) }}</span>
              <span class="min-w-0 flex-1 truncate text-black/65">{{ recentDetail(a) }}</span>
              <RelativeTime :date="a.createdAt" class="ml-auto whitespace-nowrap text-black/65" />
            </li>
          </ul>
          <div class="mt-4">
            <Link :as="RouterLink" :to="`${base}/logs`">{{ t('dashboard.activity.seeAll') }}</Link>
          </div>
        </Card>

        <Card v-if="actions.length" :title="t('dashboard.actions.title')">
          <div class="flex flex-wrap gap-2">
            <Button v-for="a in actions" :key="a.key" :as="RouterLink" :to="a.to">
              <template #leading><component :is="a.icon" /></template>
              {{ a.label }}
            </Button>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>
