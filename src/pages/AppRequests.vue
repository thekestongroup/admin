<script setup lang="ts">
import { Inbox, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  InputTextArea,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  formatDate,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { api, type AppInfo, type AppRequest } from '../lib/api'
import { refreshRequestCount } from '../lib/requests'

const { t } = useI18n()
const { notify } = useNotifications()

/**
 * Apps people have asked for: pending first, with who, which app, why, and what
 * approving will do (add them to the app's "Approved requests" rule, assign a
 * licence). Approve or decline one, or several at once.
 */
const route = useRoute()
const orgId = route.params.orgId as string

const requests = ref<AppRequest[]>()
const apps = ref<AppInfo[]>([])
const error = ref<string>()
const status = ref<string[]>(['pending'])
const app = ref<string[]>([])
const q = ref('')
const selected = ref<string[]>([])
const busy = ref<string>()

async function load() {
  const p = new URLSearchParams()
  if (status.value.length === 1) p.set('status', status.value[0]!)
  if (app.value.length === 1) p.set('app', app.value[0]!)
  if (q.value.trim()) p.set('q', q.value.trim())
  try {
    const list = await api.appRequests(orgId, p.size ? `?${p}` : '')
    // Several statuses or apps: filtered here (the server takes one of each).
    requests.value = list.filter(
      (r) => (status.value.length < 2 || status.value.includes(r.status)) && (app.value.length < 2 || app.value.includes(r.clientId)),
    )
    selected.value = selected.value.filter((id) => requests.value?.some((r) => r.id === id && r.status === 'pending'))
    error.value = undefined
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  refreshRequestCount(orgId)
}
onMounted(async () => {
  api.apps(orgId).then((a) => (apps.value = a.apps)).catch(() => {})
  await load()
})
let timer: ReturnType<typeof setTimeout> | undefined
watch([status, app, q], () => {
  clearTimeout(timer)
  timer = setTimeout(load, 250)
})

const statusOptions = computed(() => ['pending', 'approved', 'declined'].map((s) => ({ label: t(`appRequests.statuses.${s}`), value: s })))
const appOptions = computed(() => apps.value.map((a) => ({ label: a.name, value: a.id })))
const color = { pending: 'blue', approved: 'green', declined: 'red' } as const
const pending = computed(() => requests.value?.filter((r) => r.status === 'pending') ?? [])
const allSelected = computed(() => pending.value.length > 0 && pending.value.every((r) => selected.value.includes(r.id)))
const toggleAll = (on: boolean) => (selected.value = on ? pending.value.map((r) => r.id) : [])
const toggle = (id: string, on: boolean) => (selected.value = on ? [...selected.value, id] : selected.value.filter((x) => x !== id))

async function approve(ids: string[]) {
  busy.value = 'approve'
  try {
    if (ids.length === 1) {
      await api.decideAppRequest(orgId, ids[0]!, 'approve')
      notify({ type: 'success', title: t('appRequests.approved') })
    } else report(await api.bulkAppRequests(orgId, ids, 'approve'))
  } catch (e) {
    notify({ type: 'error', title: t('appRequests.couldntDecide'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = undefined
    await load()
  }
}

function report(res: { results: { name: string; app: string; result: string; reason?: string }[] }) {
  const skipped = res.results.filter((r) => r.result === 'skipped')
  const done = res.results.length - skipped.length
  notify({
    type: skipped.length ? 'warning' : 'success',
    title: t('appRequests.bulkDone', { done, skipped: skipped.length }),
    description: skipped.map((r) => t('appRequests.bulkSkipped', { name: r.name, app: r.app, reason: r.reason ?? '' })).join('\n') || undefined,
  })
}

// Declining: with an optional message.
const declining = ref<string[]>([])
const declineOpen = ref(false)
const message = ref('')
function startDecline(ids: string[]) {
  declining.value = ids
  message.value = ''
  declineOpen.value = true
}
async function decline() {
  busy.value = 'decline'
  try {
    if (declining.value.length === 1) {
      await api.decideAppRequest(orgId, declining.value[0]!, 'decline', { message: message.value })
      notify({ type: 'success', title: t('appRequests.declined') })
    } else report(await api.bulkAppRequests(orgId, declining.value, 'decline', message.value))
    declineOpen.value = false
  } catch (e) {
    notify({ type: 'error', title: t('appRequests.couldntDecide'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = undefined
    await load()
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-3 p-4 sm:p-6">
    <PageHeader :title="t('appRequests.title')" :description="t('appRequests.description')" />

    <Card>
      <div class="grid gap-3 sm:grid-cols-3">
        <Input v-model="q" :label="t('appRequests.search')" type="search" />
        <Select v-model="status" :label="t('appRequests.status')" :options="statusOptions" :placeholder="t('appRequests.anyStatus')" multiple />
        <Select v-model="app" :label="t('appRequests.app')" :options="appOptions" :placeholder="t('appRequests.anyApp')" multiple />
      </div>
    </Card>

    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('appRequests.couldntLoad')" :description="error" /></Card>
    <div v-else-if="!requests" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <div v-if="pending.length" class="flex flex-wrap items-center gap-3">
        <Checkbox :model-value="allSelected" :label="t('appRequests.selectAll')" @update:model-value="toggleAll($event === true)" />
        <template v-if="selected.length">
          <span class="text-sm text-black/65" aria-live="polite">{{ t('appRequests.selected', { count: selected.length }) }}</span>
          <Button size="sm" :status="busy === 'approve' ? 'loading' : 'idle'" :loading-text="t('appRequests.deciding')" @click="approve(selected)">
            {{ t('appRequests.approveSelected') }}
          </Button>
          <Button size="sm" variant="danger" @click="startDecline(selected)">{{ t('appRequests.declineSelected') }}</Button>
        </template>
      </div>

      <Card v-for="r in requests" :key="r.id">
        <div class="flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <Checkbox
              v-if="r.status === 'pending'"
              :model-value="selected.includes(r.id)"
              :label="t('appRequests.selectRequest', { name: r.userName, app: r.appName })"
              hide-label
              @update:model-value="toggle(r.id, $event as boolean)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold">{{ r.userName }} → {{ r.appName }}</h2>
                <Badge size="sm" :color="color[r.status]">{{ t(`appRequests.statuses.${r.status}`) }}</Badge>
              </div>
              <span class="text-sm text-black/65">{{ r.userEmail }} · {{ t('appRequests.asked', { date: formatDate(r.createdAt) }) }}</span>
              <p class="text-sm"><span class="font-bold">{{ t('appRequests.reason') }}:</span> {{ r.reason }}</p>
            </div>
          </div>

          <div v-if="r.status === 'pending' && r.plan" class="rounded bg-black/5 p-3 text-sm">
            <template v-if="r.plan.alreadyAccess">{{ t('appRequests.alreadyAccess', { name: r.userName, app: r.appName }) }}</template>
            <template v-else>
              <span class="font-bold">{{ t('appRequests.willDo') }}</span>
              <ul class="ml-5 list-disc">
                <li v-if="r.plan.addToRule">{{ t('appRequests.willAddToRule', { name: r.userName, app: r.appName }) }}</li>
                <li v-if="r.plan.assignLicence">
                  {{ t('appRequests.willAssignLicence', { name: r.userName, app: r.appName }) }} ({{
                    r.plan.seatsLeft === null ? t('appRequests.unlimitedSeats') : t('appRequests.seatsLeft', { count: r.plan.seatsLeft }, r.plan.seatsLeft)
                  }})
                </li>
              </ul>
              <p v-if="r.plan.noSeats" class="mt-1 text-red" role="alert">{{ t('appRequests.noSeatsLeft', { app: r.appName }) }}</p>
            </template>
          </div>
          <div v-else-if="r.status === 'approved' && (r.addedToRule || r.licenceAssigned)" class="text-sm text-black/65">
            {{ t('appRequests.did') }}
            <template v-if="r.addedToRule">{{ t('appRequests.didAddToRule') }}. </template>
            <template v-if="r.licenceAssigned">{{ t('appRequests.didAssignLicence') }}.</template>
          </div>
          <p v-if="r.status !== 'pending'" class="text-sm text-black/65">
            {{ t('appRequests.decidedBy', { status: t(`appRequests.statuses.${r.status}`), date: r.decidedAt ? formatDate(r.decidedAt) : '', name: r.decidedByName }) }}
            <template v-if="r.decisionMessage"> · {{ t('appRequests.message', { message: r.decisionMessage }) }}</template>
          </p>

          <div v-if="r.status === 'pending'" class="flex gap-2">
            <Button size="sm" :disabled="r.plan?.noSeats" :status="busy === 'approve' ? 'loading' : 'idle'" @click="approve([r.id])">
              {{ t('appRequests.approve') }}<span class="sr-only"> {{ t('appRequests.approveFor', { name: r.userName, app: r.appName }) }}</span>
            </Button>
            <Button size="sm" variant="basic" @click="startDecline([r.id])">
              {{ t('appRequests.decline') }}<span class="sr-only"> {{ t('appRequests.declineFor', { name: r.userName, app: r.appName }) }}</span>
            </Button>
          </div>
        </div>
      </Card>

      <Card v-if="!requests.length">
        <EmptyState :icon="Inbox" :title="q || app.length ? t('appRequests.noMatch') : t('appRequests.none')" :description="q || app.length ? t('appRequests.noMatchDescription') : t('appRequests.noneDescription')" />
      </Card>
    </template>

    <Slideover v-model:open="declineOpen" :title="t('appRequests.declineTitle', { count: declining.length }, declining.length)">
      <template #body>
        <div class="flex flex-col gap-4">
          <p class="text-sm">{{ t('appRequests.declineIntro') }}</p>
          <InputTextArea v-model="message" :label="t('appRequests.messageLabel')" :helper="t('appRequests.messageHelper')" :maxlength="500" />
        </div>
      </template>
      <template #footer>
        <Button variant="danger" :status="busy === 'decline' ? 'loading' : 'idle'" :loading-text="t('appRequests.deciding')" @click="decline">
          {{ t('appRequests.confirmDecline') }}
        </Button>
        <Button variant="basic" @click="declineOpen = false">{{ t('appRequests.cancel') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
