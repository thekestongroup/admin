<script setup lang="ts">
import { CircleCheck, CircleAlert, CircleX, Wrench } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  CheckboxGroup,
  EmptyState,
  Input,
  InputDate,
  InputTextArea,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  formatDateTime,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ApiError,
  api,
  serviceIds,
  type Incident,
  type IncidentImpact,
  type IncidentStatus,
  type Maintenance,
  type ServiceId,
  type ServiceState,
} from '../lib/api'
import { health, loadHealth } from '../lib/platform'

const { t } = useI18n()
const { notify } = useNotifications()

/**
 * Service health: each service's status, current and recent incidents with
 * their timelines, and scheduled maintenance. TKG Admins (canManage) open
 * and update incidents and schedule maintenance.
 */
const loading = ref(true)
const loadError = ref<string>()
onMounted(async () => {
  await loadHealth()
  if (!health.value) loadError.value = t('health.couldntLoad')
  loading.value = false
})

const stateIcon = { operational: CircleCheck, degraded: CircleAlert, outage: CircleX, maintenance: Wrench }
const stateColor: Record<ServiceState, 'green' | 'yellow' | 'red' | 'blue'> = {
  operational: 'green',
  degraded: 'yellow',
  outage: 'red',
  maintenance: 'blue',
}
const statuses: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved']
const active = computed(() => health.value?.incidents.filter((i) => i.status !== 'resolved') ?? [])
const recent = computed(() => health.value?.incidents.filter((i) => i.status === 'resolved') ?? [])
const serviceName = (id: ServiceId) => t(`health.services.${id}`)
const serviceList = (ids: ServiceId[]) => ids.map(serviceName).join(', ')
const serviceOptions = computed(() => serviceIds.map((id) => ({ label: serviceName(id), value: id })))
const statusOptions = computed(() => statuses.map((s) => ({ label: t(`health.incidentStatus.${s}`), value: s })))
const impactOptions = computed(() =>
  (['degraded', 'outage'] as const).map((i) => ({ label: t(`health.impact.${i}`), value: i })),
)
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── Incident slideover: open one, or add an update to one ───────────────────

const incidentOpen = ref(false)
const editing = ref<Incident>()
const form = ref({
  title: '',
  impact: 'degraded' as IncidentImpact,
  status: 'investigating' as IncidentStatus,
  services: [] as ServiceId[],
  message: '',
})
const errors = ref<Record<string, string>>({})
const status = ref<ButtonStatus>('idle')

function openIncident(incident?: Incident) {
  editing.value = incident
  form.value = {
    title: incident?.title ?? '',
    impact: incident?.impact ?? 'degraded',
    status: incident?.status ?? 'investigating',
    services: incident?.services ?? [],
    message: '',
  }
  errors.value = {}
  status.value = 'idle'
  incidentOpen.value = true
}

function fail(e: unknown, title: string) {
  status.value = 'idle'
  if (e instanceof ApiError && e.field) errors.value = { [e.field]: e.message }
  else notify({ type: 'error', title, description: message(e) })
}

async function saveIncident() {
  const f = form.value
  errors.value = {}
  if (!editing.value && !f.title.trim()) errors.value.title = t('health.errors.title')
  if (!editing.value && !f.services.length) errors.value.services = t('health.errors.services')
  if (!f.message.trim()) errors.value.message = t('health.errors.message')
  if (Object.keys(errors.value).length) return
  status.value = 'loading'
  try {
    if (editing.value) await api.updateIncident(editing.value.id, { status: f.status, impact: f.impact, message: f.message })
    else await api.openIncident({ ...f })
    await loadHealth()
    notify({ type: 'success', title: t(editing.value ? 'health.incidentUpdated' : 'health.incidentOpened') })
    status.value = 'idle'
    incidentOpen.value = false
  } catch (e) {
    fail(e, t('health.couldntSave'))
  }
}

// ── Maintenance slideover ───────────────────────────────────────────────────

const maintenanceOpen = ref(false)
const mForm = ref({ title: '', description: '', services: [] as ServiceId[], startDate: '', startTime: '09:00', endDate: '', endTime: '10:00' })

function openMaintenance() {
  mForm.value = { title: '', description: '', services: [], startDate: '', startTime: '09:00', endDate: '', endTime: '10:00' }
  errors.value = {}
  status.value = 'idle'
  maintenanceOpen.value = true
}

const when = (date: string, time: string) => {
  const d = new Date(`${date}T${time}`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

async function saveMaintenance() {
  const f = mForm.value
  errors.value = {}
  if (!f.title.trim()) errors.value.title = t('health.errors.title')
  if (!f.services.length) errors.value.services = t('health.errors.services')
  const start = when(f.startDate, f.startTime)
  const end = when(f.endDate, f.endTime)
  if (!start) errors.value.startsAt = t('health.errors.when')
  if (!end) errors.value.endsAt = t('health.errors.when')
  else if (start && end <= start) errors.value.endsAt = t('health.errors.endAfterStart')
  if (Object.keys(errors.value).length || !start || !end) return
  status.value = 'loading'
  try {
    await api.scheduleMaintenance({
      title: f.title,
      description: f.description,
      services: f.services,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    })
    await loadHealth()
    notify({ type: 'success', title: t('health.maintenanceScheduled') })
    status.value = 'idle'
    maintenanceOpen.value = false
  } catch (e) {
    fail(e, t('health.couldntSave'))
  }
}

async function cancelMaintenance(m: Maintenance) {
  try {
    await api.cancelMaintenance(m.id)
    await loadHealth()
    notify({ type: 'success', title: t('health.maintenanceCancelled') })
  } catch (e) {
    notify({ type: 'error', title: t('health.couldntSave'), description: message(e) })
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('health.title')" :description="t('health.description')">
      <template v-if="health?.canManage" #actions>
        <Button @click="openMaintenance()">{{ t('health.scheduleMaintenance') }}</Button>
        <Button variant="primary" @click="openIncident()">{{ t('health.openIncident') }}</Button>
      </template>
    </PageHeader>

    <div v-if="loading" class="flex justify-center py-8"><Spinner :label="t('common.loading')" /></div>
    <Card v-else-if="loadError"><EmptyState :title="t('health.couldntLoad')" :description="loadError" /></Card>
    <template v-else-if="health">
      <Card :title="t('health.servicesTitle')">
        <ul class="flex flex-col divide-y divide-black/10">
          <li v-for="s in health.services" :key="s.id" class="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
            <component :is="stateIcon[s.status]" class="size-5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1 font-bold">{{ serviceName(s.id) }}</span>
            <Badge :color="stateColor[s.status]">{{ t(`health.state.${s.status}`) }}</Badge>
          </li>
        </ul>
      </Card>

      <Card :title="t('health.activeTitle')">
        <p v-if="!active.length" class="flex items-center gap-2 text-sm" role="status">
          <CircleCheck class="size-5 shrink-0 text-green" aria-hidden="true" />{{ t('health.noActive') }}
        </p>
        <div v-else class="flex flex-col gap-6">
          <article v-for="i in active" :key="i.id" class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-bold">{{ i.title }}</h2>
              <Badge :color="i.impact === 'outage' ? 'red' : 'yellow'">{{ t(`health.impact.${i.impact}`) }}</Badge>
              <Badge>{{ t(`health.incidentStatus.${i.status}`) }}</Badge>
              <Button v-if="health.canManage" size="sm" class="ml-auto" @click="openIncident(i)">{{ t('health.addUpdate') }}</Button>
            </div>
            <p class="text-sm text-black/65">{{ t('health.affects', { services: serviceList(i.services) }) }}</p>
            <ol class="flex flex-col gap-2 border-l-2 border-black/15 pl-4">
              <li v-for="u in i.updates" :key="u.id" class="text-sm">
                <span class="font-bold">{{ t(`health.incidentStatus.${u.status}`) }}</span>
                <span class="text-black/65"> · {{ formatDateTime(u.createdAt) }}</span>
                <p class="whitespace-pre-line">{{ u.message }}</p>
              </li>
            </ol>
          </article>
        </div>
      </Card>

      <Card :title="t('health.maintenanceTitle')">
        <p v-if="!health.maintenance.length" class="text-sm text-black/65">{{ t('health.noMaintenance') }}</p>
        <ul v-else class="flex flex-col divide-y divide-black/10">
          <li v-for="m in health.maintenance" :key="m.id" class="flex flex-wrap items-start gap-3 py-3 text-sm first:pt-0 last:pb-0">
            <div class="min-w-0 flex-1">
              <p class="font-bold">{{ m.title }}</p>
              <p class="text-black/65">{{ t('health.window', { from: formatDateTime(m.startsAt), to: formatDateTime(m.endsAt) }) }}</p>
              <p class="text-black/65">{{ t('health.affects', { services: serviceList(m.services) }) }}</p>
              <p v-if="m.description" class="mt-1 whitespace-pre-line">{{ m.description }}</p>
            </div>
            <Button v-if="health.canManage" size="sm" @click="cancelMaintenance(m)">{{ t('health.cancelMaintenance') }}</Button>
          </li>
        </ul>
      </Card>

      <Card :title="t('health.recentTitle')" :description="t('health.recentDescription')">
        <p v-if="!recent.length" class="text-sm text-black/65">{{ t('health.noRecent') }}</p>
        <div v-else class="flex flex-col gap-6">
          <article v-for="i in recent" :key="i.id" class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-bold">{{ i.title }}</h2>
              <Badge color="green">{{ t('health.incidentStatus.resolved') }}</Badge>
            </div>
            <p class="text-sm text-black/65">{{ t('health.affects', { services: serviceList(i.services) }) }}</p>
            <ol class="flex flex-col gap-2 border-l-2 border-black/15 pl-4">
              <li v-for="u in i.updates" :key="u.id" class="text-sm">
                <span class="font-bold">{{ t(`health.incidentStatus.${u.status}`) }}</span>
                <span class="text-black/65"> · {{ formatDateTime(u.createdAt) }}</span>
                <p class="whitespace-pre-line">{{ u.message }}</p>
              </li>
            </ol>
          </article>
        </div>
      </Card>
    </template>

    <Slideover
      v-model:open="incidentOpen"
      :title="editing ? t('health.addUpdateTitle', { title: editing.title }) : t('health.openIncident')"
      initial-focus="auto"
    >
      <template #body>
        <form id="incident" class="flex flex-col gap-4" novalidate @submit.prevent="saveIncident">
          <Input v-if="!editing" v-model="form.title" :label="t('health.fields.title')" :error-text="errors.title" />
          <CheckboxGroup v-if="!editing" v-model="form.services" :label="t('health.fields.services')" :options="serviceOptions" :error-text="errors.services" />
          <Select v-model="form.impact" :label="t('health.fields.impact')" :options="impactOptions" />
          <Select v-model="form.status" :label="t('health.fields.status')" :options="statusOptions" />
          <InputTextArea v-model="form.message" :label="t('health.fields.message')" :max-length="2000" :error-text="errors.message" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="incident" variant="primary" :status="status" :loading-text="t('common.saving')">
          {{ editing ? t('health.postUpdate') : t('health.openIncident') }}
        </Button>
      </template>
    </Slideover>

    <Slideover v-model:open="maintenanceOpen" :title="t('health.scheduleMaintenance')" initial-focus="auto">
      <template #body>
        <form id="maintenance" class="flex flex-col gap-4" novalidate @submit.prevent="saveMaintenance">
          <Input v-model="mForm.title" :label="t('health.fields.title')" :error-text="errors.title" />
          <InputTextArea v-model="mForm.description" :label="t('health.fields.description')" :max-length="2000" />
          <CheckboxGroup v-model="mForm.services" :label="t('health.fields.services')" :options="serviceOptions" :error-text="errors.services" />
          <InputDate v-model="mForm.startDate" :label="t('health.fields.startDate')" :error-text="errors.startsAt" />
          <Input v-model="mForm.startTime" :label="t('health.fields.startTime')" placeholder="09:00" />
          <InputDate v-model="mForm.endDate" :label="t('health.fields.endDate')" :error-text="errors.endsAt" />
          <Input v-model="mForm.endTime" :label="t('health.fields.endTime')" placeholder="10:00" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="maintenance" variant="primary" :status="status" :loading-text="t('common.saving')">
          {{ t('health.schedule') }}
        </Button>
      </template>
    </Slideover>
  </div>
</template>
