<script setup lang="ts">
import { Pencil } from '@lucide/vue'
import { Button, type ButtonStatus, Card, Input, Link, Select, Slideover, SummaryList, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type AttributeValue, type ProfileChanges, type UserAttribute, type UserDetail } from '../lib/api'

const { t } = useI18n()

/**
 * A user's work profile (job title, department, office, phone numbers,
 * employee ID, manager, start date and the organisation's custom
 * attributes), with who they report to and their direct reports.
 */
const props = defineProps<{ orgId: string; user: UserDetail; canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { notify } = useNotifications()

const NONE = '__none'
const defs = ref<UserAttribute[]>([])
const people = ref<{ label: string; value: string }[]>([])
onMounted(async () => {
  defs.value = await api.userAttributes(props.orgId).catch(() => [])
})

const p = computed(() => props.user.profile)
const userLink = (id: string) => `/organisations/${props.orgId}/users/${id}`

function show(v: AttributeValue | undefined) {
  if (v === undefined || v === '') return ''
  return typeof v === 'boolean' ? t(v ? 'profiles.yes' : 'profiles.no') : String(v)
}
const items = computed(() => [
  { label: t('profiles.fields.jobTitle'), value: p.value.jobTitle },
  { label: t('profiles.fields.department'), value: p.value.department },
  { label: t('profiles.fields.office'), value: p.value.office },
  { label: t('profiles.fields.phone'), value: p.value.phone },
  { label: t('profiles.fields.mobile'), value: p.value.mobile },
  { label: t('profiles.fields.employeeId'), value: p.value.employeeId },
  { label: t('profiles.fields.startDate'), value: p.value.startDate },
  ...defs.value.map((d) => ({ label: d.label, value: show(p.value.attributes[d.key]) })),
])

// ── Editing ─────────────────────────────────────────────────────────────────

const open = ref(false)
const status = ref<ButtonStatus>('idle')
const form = reactive({
  jobTitle: '', department: '', office: '', phone: '', mobile: '', employeeId: '', startDate: '', managerId: NONE,
  attributes: {} as Record<string, string>,
})
const errors = reactive<Record<string, string | undefined>>({})

async function start() {
  const v = p.value
  Object.assign(form, { jobTitle: v.jobTitle, department: v.department, office: v.office, phone: v.phone, mobile: v.mobile,
    employeeId: v.employeeId, startDate: v.startDate, managerId: v.managerId || NONE, attributes: {} })
  for (const d of defs.value) {
    const a = v.attributes[d.key]
    form.attributes[d.key] = a === undefined ? '' : typeof a === 'boolean' ? (a ? 'yes' : 'no') : String(a)
  }
  for (const k of Object.keys(errors)) errors[k] = undefined
  status.value = 'idle'
  open.value = true
  if (!people.value.length) {
    const users = await api.users(props.orgId).catch(() => [])
    people.value = users.filter((u) => u.id !== props.user.id && !u.support).map((u) => ({ label: `${u.name} (${u.email})`, value: u.id }))
  }
}

const managerOptions = computed(() => [{ label: t('profiles.noManager'), value: NONE }, ...people.value])
const yesNo = computed(() => [
  { label: t('profiles.unset'), value: '' },
  { label: t('profiles.yes'), value: 'yes' },
  { label: t('profiles.no'), value: 'no' },
])
const choiceOptions = (d: UserAttribute) => [{ label: t('profiles.unset'), value: '' }, ...d.choices.map((c) => ({ label: c, value: c }))]

async function save() {
  status.value = 'loading'
  for (const k of Object.keys(errors)) errors[k] = undefined
  const changes: ProfileChanges = {
    jobTitle: form.jobTitle, department: form.department, office: form.office, phone: form.phone, mobile: form.mobile,
    employeeId: form.employeeId, startDate: form.startDate, managerId: form.managerId === NONE ? null : form.managerId,
    attributes: Object.fromEntries(Object.entries(form.attributes).map(([k, v]) => [k, v === '' ? null : v])),
  }
  try {
    await api.putUserProfile(props.orgId, props.user.id, changes)
    open.value = false
    emit('changed')
    notify({ type: 'success', title: t('profiles.updated') })
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else notify({ type: 'error', title: t('profiles.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card :title="t('profiles.title')">
    <template v-if="canEdit" #actions>
      <Button size="sm" @click="start">
        <template #leading><Pencil /></template>
        {{ t('profiles.edit') }}
      </Button>
    </template>
    <div class="flex flex-col gap-4">
      <SummaryList :items="[
        { label: t('profiles.reportsTo'), value: p.manager?.name ?? t('profiles.noManager') },
        ...items,
      ]">
        <template #value="{ item }">
          <Link v-if="item.label === t('profiles.reportsTo') && p.manager" :to="userLink(p.manager.id)" :component="RouterLink">{{ p.manager.name }}</Link>
          <span v-else-if="item.value">{{ item.value }}</span>
          <span v-else class="text-black/65">{{ t('profiles.unset') }}</span>
        </template>
      </SummaryList>
      <div>
        <h3 class="mb-2 text-sm font-bold">{{ t('profiles.directReports') }}</h3>
        <p v-if="!user.reports.length" class="text-sm text-black/65">{{ t('profiles.noReports', { name: user.name }) }}</p>
        <ul v-else class="flex flex-col gap-1 text-sm">
          <li v-for="r in user.reports" :key="r.id">
            <Link :to="userLink(r.id)" :component="RouterLink">{{ r.name }}</Link>
            <span v-if="r.jobTitle" class="text-black/65"> · {{ r.jobTitle }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Card>

  <Slideover v-model:open="open" :title="t('profiles.editTitle')" initial-focus="auto">
    <template #body>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
        <Input v-model="form.jobTitle" :label="t('profiles.fields.jobTitle')" :error-text="errors.jobTitle" />
        <Input v-model="form.department" :label="t('profiles.fields.department')" :error-text="errors.department" />
        <Input v-model="form.office" :label="t('profiles.fields.office')" :error-text="errors.office" />
        <Input v-model="form.phone" type="tel" :label="t('profiles.fields.phone')" :helper="t('profiles.phoneHelper')" :error-text="errors.phone" />
        <Input v-model="form.mobile" type="tel" :label="t('profiles.fields.mobile')" :helper="t('profiles.phoneHelper')" :error-text="errors.mobile" />
        <Input v-model="form.employeeId" :label="t('profiles.fields.employeeId')" :error-text="errors.employeeId" />
        <Select v-model="form.managerId" searchable :label="t('profiles.fields.manager')" :options="managerOptions" :error-text="errors.managerId" />
        <Input v-model="form.startDate" type="date" :label="t('profiles.fields.startDate')" :error-text="errors.startDate" />
        <template v-for="d in defs" :key="d.key">
          <Select v-if="d.type === 'boolean'" v-model="form.attributes[d.key]" :label="d.label" :options="yesNo" :error-text="errors['attributes.' + d.key]" />
          <Select v-else-if="d.type === 'choice'" v-model="form.attributes[d.key]" :label="d.label" :options="choiceOptions(d)" :error-text="errors['attributes.' + d.key]" />
          <Input
            v-else
            v-model="form.attributes[d.key]"
            :type="d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : 'text'"
            :label="d.label"
            :error-text="errors['attributes.' + d.key]"
          />
        </template>
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="primary" :status="status" :loading-text="t('profiles.saving')" @click="save">{{ t('profiles.save') }}</Button>
    </template>
  </Slideover>
</template>
