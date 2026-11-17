<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Power, PowerOff, Trash2 } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Menu,
  type MenuItem,
  Slideover,
  Spinner,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { api, type AppMode, type AppRule, type AppRuleOptions } from '../lib/api'
import AppRuleSlideover from './AppRuleSlideover.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * An app's access rules: tried from the top; the first turned-on rule whose
 * conditions all match gives the person's access to the app (Enabled,
 * Disabled or Forced); no match, the app's default. Rules can be changed,
 * moved, turned off and deleted from each row's menu.
 */
const props = defineProps<{ orgId: string; appId: string; options: AppRuleOptions }>()
const emit = defineEmits<{ changed: [] }>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const rules = ref<AppRule[]>()
const error = ref<string>()
async function load() {
  try {
    rules.value = await api.appRules(props.orgId, props.appId)
    error.value = undefined
  } catch (e) {
    error.value = message(e)
  }
}
onMounted(load)
async function changed() {
  await load()
  emit('changed')
}

// What a rule applies to, in words.
const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? t('apps.rules.unknown')
function appliesTo(r: AppRule): string {
  const parts = [
    r.users.length ? t('apps.rules.users', { names: r.users.map((id) => nameOf(props.options.users, id)).join(', ') }) : '',
    r.groups.length ? t('apps.rules.groups', { names: r.groups.map((id) => nameOf(props.options.groups, id)).join(', ') }) : '',
    r.ipRanges.length ? t('apps.rules.ipAddresses', { names: r.ipRanges.join(', ') }) : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('apps.rules.everyone')
}

const modeColor = { forced: 'primary', enabled: 'green', disabled: 'red' } as const

const columns = computed<TableColumn<AppRule>[]>(() => [
  { key: 'name', label: t('apps.rules.columns.rule'), rowHeader: true },
  { key: 'applies', label: t('apps.rules.columns.appliesTo'), nowrap: false },
  { key: 'mode', label: t('apps.rules.columns.access') },
  { key: 'actions', label: t('common.actions'), hideLabel: true, align: 'end' },
])

function menu(r: AppRule, i: number): MenuItem[] {
  const last = (rules.value?.length ?? 0) - 1
  return [
    { label: t('common.change'), icon: Pencil, onSelect: () => edit(r) },
    { label: t('apps.rules.moveUp'), icon: ArrowUp, disabled: i === 0, onSelect: () => move(i, -1) },
    { label: t('apps.rules.moveDown'), icon: ArrowDown, disabled: i === last, onSelect: () => move(i, 1) },
    r.enabled
      ? { label: t('apps.rules.turnOff'), icon: PowerOff, onSelect: () => toggle(r) }
      : { label: t('apps.rules.turnOn'), icon: Power, onSelect: () => toggle(r) },
    { label: t('common.delete'), icon: Trash2, onSelect: () => (deleting.value = r) },
  ]
}

// ── Adding and changing ─────────────────────────────────────────────────────
const editing = ref(false)
const current = ref<AppRule>()
function edit(r?: AppRule) {
  current.value = r
  editing.value = true
}

async function toggle(r: AppRule) {
  try {
    await api.saveAppRule(props.orgId, props.appId, { ...r, enabled: !r.enabled })
    await changed()
    notify({ type: 'success', title: r.enabled ? t('apps.rules.turnedOff', { name: r.name }) : t('apps.rules.turnedOn', { name: r.name }) })
  } catch (e) {
    notify({ type: 'error', title: t('apps.rules.couldntChange'), description: message(e) })
  }
}

async function move(i: number, by: number) {
  const ids = rules.value!.map((r) => r.id)
  ;[ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!]
  try {
    rules.value = await api.orderAppRules(props.orgId, props.appId, ids)
  } catch (e) {
    notify({ type: 'error', title: t('apps.rules.couldntMove'), description: message(e) })
  }
}

// ── Deleting ────────────────────────────────────────────────────────────────
const deleting = ref<AppRule>()
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => { if (!v) deleting.value = undefined } })
const deleteStatus = ref<ButtonStatus>('idle')
async function remove() {
  const r = deleting.value!
  deleteStatus.value = 'loading'
  try {
    await api.deleteAppRule(props.orgId, props.appId, r.id)
    deleting.value = undefined
    await changed()
    notify({ type: 'success', title: t('apps.rules.deleted'), description: t('apps.rules.deletedDescription', { name: r.name }) })
  } catch (e) {
    notify({ type: 'error', title: t('apps.rules.couldntDelete'), description: message(e) })
  } finally {
    deleteStatus.value = 'idle'
  }
}
</script>

<template>
  <Card
    :title="t('apps.rules.title')"
    :description="t('apps.rules.description')"
    padding="none"
  >
    <template #actions>
      <Button variant="primary" size="sm" @click="edit()">
        <template #leading><Plus /></template>
        {{ t('apps.rules.add') }}
      </Button>
    </template>
    <EmptyState v-if="error" size="sm" :title="t('apps.rules.couldntLoad')" :description="error" />
    <div v-else-if="!rules" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <Table v-else inset :columns="columns" :rows="rules" row-key="id" :caption="t('apps.rules.caption')">
      <template #cell-name="{ row, index }">
        <span class="text-black/65">{{ index + 1 }}.</span> {{ row.name }}
        <Badge v-if="!row.enabled" size="sm" class="ml-1">{{ t('apps.rules.turnedOffBadge') }}</Badge>
      </template>
      <template #cell-applies="{ row }">{{ appliesTo(row) }}</template>
      <template #cell-mode="{ row }">
        <Badge size="sm" :color="modeColor[row.mode as AppMode]">{{ t(`apps.mode.${row.mode}`) }}</Badge>
      </template>
      <template #cell-actions="{ row, index }">
        <Menu :items="menu(row, index)" :label="t('common.actionsFor', { name: row.name })" size="sm" />
      </template>
      <template #empty>
        <EmptyState size="sm" :title="t('apps.rules.none')" :description="t('apps.rules.noneDescription')" class="p-0" />
      </template>
    </Table>
  </Card>

  <AppRuleSlideover v-model:open="editing" :org-id="orgId" :app-id="appId" :options="options" :rule="current" @saved="changed" />

  <Slideover v-model:open="deleteOpen" :title="deleting ? t('apps.rules.deleteTitle', { name: deleting.name }) : t('apps.rules.deleteRule')" :description="t('apps.rules.deleteDescription')">
    <template #footer="{ close }">
      <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="danger" :status="deleteStatus" :loading-text="t('common.deleting')" @click="remove">{{ t('apps.rules.deleteRule') }}</Button>
    </template>
  </Slideover>
</template>
