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
import { api, type MfaRule, type MfaRuleOptions } from '../lib/api'
import MfaRuleSlideover from './MfaRuleSlideover.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * MFA custom rules: tried from the top; the first turned-on rule whose
 * conditions all match decides whether MFA is required. Rules can be
 * changed, moved, turned off and deleted from each row's menu.
 */
const props = defineProps<{ orgId: string; options: MfaRuleOptions }>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const rules = ref<MfaRule[]>()
const error = ref<string>()
async function load() {
  try {
    rules.value = await api.mfaRules(props.orgId)
    error.value = undefined
  } catch (e) {
    error.value = message(e)
  }
}
onMounted(load)

// What a rule applies to, in words.
const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? t('mfa.rules.unknown')
function appliesTo(r: MfaRule): string {
  const parts = [
    r.users.length ? t('mfa.rules.users', { names: r.users.map((id) => nameOf(props.options.users, id)).join(', ') }) : '',
    r.groups.length ? t('mfa.rules.groups', { names: r.groups.map((id) => nameOf(props.options.groups, id)).join(', ') }) : '',
    r.apps.length ? t('mfa.rules.apps', { names: r.apps.map((id) => nameOf(props.options.apps, id)).join(', ') }) : '',
    r.ipRanges.length ? t('mfa.rules.ipAddresses', { names: r.ipRanges.join(', ') }) : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('mfa.rules.everyone')
}

const columns = computed<TableColumn<MfaRule>[]>(() => [
  { key: 'name', label: t('mfa.rules.columns.rule'), rowHeader: true },
  { key: 'applies', label: t('mfa.rules.columns.appliesTo'), nowrap: false },
  { key: 'require', label: t('mfa.rules.columns.mfa') },
  { key: 'actions', label: t('common.actions'), hideLabel: true, align: 'end' },
])

function menu(r: MfaRule, i: number): MenuItem[] {
  const last = (rules.value?.length ?? 0) - 1
  return [
    { label: t('common.change'), icon: Pencil, onSelect: () => edit(r) },
    { label: t('mfa.rules.moveUp'), icon: ArrowUp, disabled: i === 0, onSelect: () => move(i, -1) },
    { label: t('mfa.rules.moveDown'), icon: ArrowDown, disabled: i === last, onSelect: () => move(i, 1) },
    r.enabled
      ? { label: t('mfa.rules.turnOff'), icon: PowerOff, onSelect: () => toggle(r) }
      : { label: t('mfa.rules.turnOn'), icon: Power, onSelect: () => toggle(r) },
    { label: t('common.delete'), icon: Trash2, onSelect: () => (deleting.value = r) },
  ]
}

// ── Adding and changing ─────────────────────────────────────────────────────
const editing = ref(false)
const current = ref<MfaRule>()
function edit(r?: MfaRule) {
  current.value = r
  editing.value = true
}

async function toggle(r: MfaRule) {
  try {
    await api.saveMfaRule(props.orgId, { ...r, enabled: !r.enabled })
    await load()
    notify({ type: 'success', title: r.enabled ? t('mfa.rules.turnedOff', { name: r.name }) : t('mfa.rules.turnedOn', { name: r.name }) })
  } catch (e) {
    notify({ type: 'error', title: t('mfa.rules.couldntChange'), description: message(e) })
  }
}

async function move(i: number, by: number) {
  const ids = rules.value!.map((r) => r.id)
  ;[ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!]
  try {
    rules.value = await api.orderMfaRules(props.orgId, ids)
  } catch (e) {
    notify({ type: 'error', title: t('mfa.rules.couldntMove'), description: message(e) })
  }
}

// ── Deleting ────────────────────────────────────────────────────────────────
const deleting = ref<MfaRule>()
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => { if (!v) deleting.value = undefined } })
const deleteStatus = ref<ButtonStatus>('idle')
async function remove() {
  const r = deleting.value!
  deleteStatus.value = 'loading'
  try {
    await api.deleteMfaRule(props.orgId, r.id)
    deleting.value = undefined
    await load()
    notify({ type: 'success', title: t('mfa.rules.deleted'), description: t('mfa.rules.deletedDescription', { name: r.name }) })
  } catch (e) {
    notify({ type: 'error', title: t('mfa.rules.couldntDelete'), description: message(e) })
  } finally {
    deleteStatus.value = 'idle'
  }
}
</script>

<template>
  <Card
    :title="t('mfa.rules.title')"
    :description="t('mfa.rules.description')"
    padding="none"
  >
    <template #actions>
      <Button variant="primary" size="sm" @click="edit()">
        <template #leading><Plus /></template>
        {{ t('mfa.rules.add') }}
      </Button>
    </template>
    <EmptyState v-if="error" size="sm" :title="t('mfa.rules.couldntLoad')" :description="error" />
    <div v-else-if="!rules" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <Table v-else inset :columns="columns" :rows="rules" row-key="id" :caption="t('mfa.rules.caption')">
      <template #cell-name="{ row, index }">
        <span class="text-black/65">{{ index + 1 }}.</span> {{ row.name }}
        <Badge v-if="!row.enabled" size="sm" class="ml-1">{{ t('mfa.rules.turnedOffBadge') }}</Badge>
      </template>
      <template #cell-applies="{ row }">{{ appliesTo(row) }}</template>
      <template #cell-require="{ row }">
        <Badge size="sm" :color="row.require ? 'green' : 'basic'">{{ row.require ? t('mfa.rules.required') : t('mfa.rules.notRequired') }}</Badge>
      </template>
      <template #cell-actions="{ row, index }">
        <Menu :items="menu(row, index)" :label="t('common.actionsFor', { name: row.name })" size="sm" />
      </template>
      <template #empty>
        <EmptyState size="sm" :title="t('mfa.rules.none')" :description="t('mfa.rules.noneDescription')" class="p-0" />
      </template>
    </Table>
  </Card>

  <MfaRuleSlideover v-model:open="editing" :org-id="orgId" :options="options" :rule="current" @saved="load" />

  <Slideover v-model:open="deleteOpen" :title="deleting ? t('mfa.rules.deleteTitle', { name: deleting.name }) : t('mfa.rules.deleteRule')" :description="t('mfa.rules.deleteDescription')">
    <template #footer="{ close }">
      <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="danger" :status="deleteStatus" :loading-text="t('common.deleting')" @click="remove">{{ t('mfa.rules.deleteRule') }}</Button>
    </template>
  </Slideover>
</template>
