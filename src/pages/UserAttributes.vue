<script setup lang="ts">
import { ListChecks, Pencil, Plus, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  InputTextArea,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type AttributeType, type UserAttribute } from '../lib/api'

const { t } = useI18n()

/**
 * Settings → User attributes: the extra details this organisation keeps
 * about its users (text, number, date, yes/no or a choice list). The key
 * and type are fixed once made; the key is the CSV column heading.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const attributes = ref<UserAttribute[]>()
const error = ref<string>()
async function load() {
  try {
    attributes.value = await api.userAttributes(orgId)
  } catch (e) {
    error.value = message(e)
  }
}
onMounted(load)

const columns = computed<TableColumn<UserAttribute>[]>(() => [
  { key: 'label', label: t('userAttributes.label'), rowHeader: true },
  { key: 'key', label: t('userAttributes.columnKey') },
  { key: 'type', label: t('userAttributes.columnType') },
  { key: 'actions', label: t('common.actions'), hideLabel: true, align: 'end' },
])
const typeOptions = computed(() =>
  (['text', 'number', 'date', 'boolean', 'choice'] as AttributeType[]).map((v) => ({ label: t(`userAttributes.types.${v}`), value: v })),
)

// ── Add or edit ─────────────────────────────────────────────────────────────

const open = ref(false)
const editingId = ref<string>()
const form = reactive({ label: '', key: '', type: 'text' as AttributeType, choices: '' })
const errors = reactive<Record<string, string | undefined>>({})
const status = ref<ButtonStatus>('idle')
const editingAttr = computed(() => attributes.value?.find((a) => a.id === editingId.value))

function start(a?: UserAttribute) {
  editingId.value = a?.id
  Object.assign(form, { label: a?.label ?? '', key: a?.key ?? '', type: a?.type ?? 'text', choices: (a?.choices ?? []).join('\n') })
  for (const k of Object.keys(errors)) errors[k] = undefined
  status.value = 'idle'
  open.value = true
}

async function save() {
  status.value = 'loading'
  for (const k of Object.keys(errors)) errors[k] = undefined
  const choices = form.type === 'choice' ? form.choices.split('\n').map((c) => c.trim()).filter(Boolean) : undefined
  try {
    if (editingId.value) await api.updateUserAttribute(orgId, editingId.value, { label: form.label, choices })
    else await api.createUserAttribute(orgId, { key: form.key, label: form.label, type: form.type, choices })
    await load()
    open.value = false
    notify({ type: 'success', title: t('userAttributes.saved') })
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else notify({ type: 'error', title: t('userAttributes.couldntSave'), description: message(e) })
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────

const deleting = ref<UserAttribute>()
const deleteOpen = ref(false)
const deleteStatus = ref<ButtonStatus>('idle')
function askDelete() {
  deleting.value = editingAttr.value
  open.value = false
  deleteStatus.value = 'idle'
  deleteOpen.value = true
}
async function remove() {
  deleteStatus.value = 'loading'
  try {
    await api.deleteUserAttribute(orgId, deleting.value!.id)
    await load()
    deleteOpen.value = false
    notify({ type: 'success', title: t('userAttributes.deleted') })
  } catch (e) {
    deleteStatus.value = 'idle'
    notify({ type: 'error', title: t('userAttributes.couldntDelete'), description: message(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('userAttributes.title')"
      :description="t('userAttributes.description')"
      :toolbar="[{ label: t('userAttributes.add'), icon: Plus, onSelect: () => start() }]"
    />
    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('userAttributes.couldntLoad')" :description="error" /></Card>
    <div v-else-if="!attributes" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <Card v-else padding="none">
      <Table :columns="columns" :rows="attributes" row-key="id" :caption="t('userAttributes.title')">
        <template #cell-key="{ row }"><code class="text-sm">{{ row.key }}</code></template>
        <template #cell-type="{ row }"><Badge size="sm" color="basic">{{ t(`userAttributes.types.${row.type}`) }}</Badge></template>
        <template #cell-actions="{ row }">
          <Button size="sm" variant="ghost" @click="start(row)">
            <template #leading><Pencil /></template>
            {{ t('common.change') }}
          </Button>
        </template>
        <template #empty>
          <EmptyState size="sm" :icon="ListChecks" :title="t('userAttributes.none')" :description="t('userAttributes.noneDescription')" class="p-0" />
        </template>
      </Table>
    </Card>

    <Slideover v-model:open="open" :title="editingId ? t('userAttributes.edit') : t('userAttributes.add')" initial-focus="auto">
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
          <Input v-model="form.label" :label="t('userAttributes.label')" :error-text="errors.label" />
          <Input
            v-model="form.key"
            :label="t('userAttributes.key')"
            :helper="t('userAttributes.keyHelper')"
            :disabled="!!editingId"
            autocapitalize="off"
            spellcheck="false"
            :error-text="errors.key"
          />
          <Select v-model="form.type" :label="t('userAttributes.type')" :options="typeOptions" :disabled="!!editingId" :error-text="errors.type" />
          <InputTextArea
            v-if="form.type === 'choice'"
            v-model="form.choices"
            :label="t('userAttributes.choices')"
            :helper="t('userAttributes.choicesHelper')"
            :error-text="errors.choices"
          />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button v-if="editingId" variant="danger" :disabled="status !== 'idle'" @click="askDelete">{{ t('userAttributes.delete') }}</Button>
        <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="status" :loading-text="t('userAttributes.saving')" @click="save">
          {{ editingId ? t('userAttributes.save') : t('userAttributes.create') }}
        </Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="deleteOpen"
      :title="t('userAttributes.deleteTitle', { label: deleting?.label })"
      :description="t('userAttributes.deleteDescription', { label: deleting?.label })"
    >
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :status="deleteStatus" :loading-text="t('common.deleting')" @click="remove">{{ t('userAttributes.deleteConfirm') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
