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
const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? 'Unknown'
function appliesTo(r: MfaRule): string {
  const parts = [
    r.users.length ? `Users: ${r.users.map((id) => nameOf(props.options.users, id)).join(', ')}` : '',
    r.groups.length ? `Groups: ${r.groups.map((id) => nameOf(props.options.groups, id)).join(', ')}` : '',
    r.apps.length ? `Apps: ${r.apps.map((id) => nameOf(props.options.apps, id)).join(', ')}` : '',
    r.ipRanges.length ? `IP addresses: ${r.ipRanges.join(', ')}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Everyone, everywhere'
}

const columns: TableColumn<MfaRule>[] = [
  { key: 'name', label: 'Rule', rowHeader: true },
  { key: 'applies', label: 'Applies to', nowrap: false },
  { key: 'require', label: 'MFA' },
  { key: 'actions', label: 'Actions', hideLabel: true, align: 'end' },
]

function menu(r: MfaRule, i: number): MenuItem[] {
  const last = (rules.value?.length ?? 0) - 1
  return [
    { label: 'Change', icon: Pencil, onSelect: () => edit(r) },
    { label: 'Move up', icon: ArrowUp, disabled: i === 0, onSelect: () => move(i, -1) },
    { label: 'Move down', icon: ArrowDown, disabled: i === last, onSelect: () => move(i, 1) },
    r.enabled
      ? { label: 'Turn off', icon: PowerOff, onSelect: () => toggle(r) }
      : { label: 'Turn on', icon: Power, onSelect: () => toggle(r) },
    { label: 'Delete', icon: Trash2, onSelect: () => (deleting.value = r) },
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
    notify({ type: 'success', title: r.enabled ? `${r.name} turned off` : `${r.name} turned on` })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change the rule', description: message(e) })
  }
}

async function move(i: number, by: number) {
  const ids = rules.value!.map((r) => r.id)
  ;[ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!]
  try {
    rules.value = await api.orderMfaRules(props.orgId, ids)
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t move the rule', description: message(e) })
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
    notify({ type: 'success', title: 'Rule deleted', description: `${r.name} no longer applies.` })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t delete the rule', description: message(e) })
  } finally {
    deleteStatus.value = 'idle'
  }
}
</script>

<template>
  <Card
    title="Custom rules"
    description="Checked from the top: the first rule that matches decides. A rule matches when everything it names does: users, groups, apps and IP addresses (devices will join them)."
    padding="none"
  >
    <template #actions>
      <Button variant="primary" size="sm" @click="edit()">
        <template #leading><Plus /></template>
        Add rule
      </Button>
    </template>
    <EmptyState v-if="error" size="sm" title="Couldn’t load the rules" :description="error" />
    <div v-else-if="!rules" class="flex justify-center py-6"><Spinner label="Loading" /></div>
    <Table v-else :columns="columns" :rows="rules" row-key="id" caption="MFA custom rules">
      <template #cell-name="{ row, index }">
        <span class="text-black/65">{{ index + 1 }}.</span> {{ row.name }}
        <Badge v-if="!row.enabled" size="sm" class="ml-1">Turned off</Badge>
      </template>
      <template #cell-applies="{ row }">{{ appliesTo(row) }}</template>
      <template #cell-require="{ row }">
        <Badge size="sm" :color="row.require ? 'green' : 'basic'">{{ row.require ? 'Required' : 'Not required' }}</Badge>
      </template>
      <template #cell-actions="{ row, index }">
        <Menu :items="menu(row, index)" :label="`Actions for ${row.name}`" size="sm" />
      </template>
      <template #empty>
        <EmptyState size="sm" title="No rules yet" description="Add one to require (or skip) MFA for particular people, apps or places." class="p-0" />
      </template>
    </Table>
  </Card>

  <MfaRuleSlideover v-model:open="editing" :org-id="orgId" :options="options" :rule="current" @saved="load" />

  <Slideover v-model:open="deleteOpen" :title="deleting ? `Delete ${deleting.name}?` : 'Delete rule'" description="It stops applying straight away. Anyone it covered is then covered by the rules below it, or Everyone else.">
    <template #footer="{ close }">
      <Button :disabled="deleteStatus !== 'idle'" @click="close">Cancel</Button>
      <Button variant="danger" :status="deleteStatus" loading-text="Deleting" @click="remove">Delete rule</Button>
    </template>
  </Slideover>
</template>
