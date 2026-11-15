<script setup lang="ts">
import { Button, type ButtonStatus, Card, RadioGroup, Select, Slideover, useNotifications } from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import { api, type BulkAction, type BulkResult, type Group, type PermissionId, type User } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import BulkSummary from './BulkSummary.vue'

/**
 * Actions on the users ticked on the Users page: reset passwords, disable,
 * enable, add to or remove from a group, delete. Each asks first, then shows
 * what was done and who was skipped (Keston ID checks each user, as for one).
 */
const props = defineProps<{
  orgId: string
  selected: User[]
  groups: Group[]
  can: (p: PermissionId) => boolean
}>()
const emit = defineEmits<{ done: [] }>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface ActionInfo {
  label: string
  title: string
  description: string
  confirm: string
  loading: string
  danger?: boolean
  needs: boolean
}

const count = computed(() => `${props.selected.length} ${props.selected.length === 1 ? 'user' : 'users'}`)
const groupPerms = computed(() => props.can('groups.manage') || props.can('permissions.assign'))

const actions = computed<Record<BulkAction, ActionInfo>>(() => ({
  'reset-password': {
    label: 'Reset passwords',
    title: `Reset passwords for ${count.value}?`,
    description: 'Each gets their own new password, which meets your password policy. They’re signed out everywhere, and unlocked if they were locked out.',
    confirm: 'Reset passwords',
    loading: 'Resetting',
    needs: props.can('users.reset_password'),
  },
  disable: {
    label: 'Disable',
    title: `Disable ${count.value}?`,
    description: 'They’re signed out of Keston and every app, and can’t sign in until they’re enabled again.',
    confirm: 'Disable',
    loading: 'Disabling',
    danger: true,
    needs: props.can('users.status'),
  },
  enable: {
    label: 'Enable',
    title: `Enable ${count.value}?`,
    description: 'They can sign in again.',
    confirm: 'Enable',
    loading: 'Enabling',
    needs: props.can('users.status'),
  },
  'add-to-group': {
    label: 'Add to group',
    title: `Add ${count.value} to a group`,
    description: 'They get the group’s apps and permissions.',
    confirm: 'Add to group',
    loading: 'Adding',
    needs: groupPerms.value,
  },
  'remove-from-group': {
    label: 'Remove from group',
    title: `Remove ${count.value} from a group`,
    description: 'They lose the apps and permissions the group gives them.',
    confirm: 'Remove from group',
    loading: 'Removing',
    needs: groupPerms.value,
  },
  delete: {
    label: 'Delete',
    title: `Delete ${count.value}?`,
    description: 'They’re signed out everywhere and can’t sign in. For 30 days you can restore them, with their groups, from Deleted users; then they’re removed for good.',
    confirm: 'Delete',
    loading: 'Deleting',
    danger: true,
    needs: props.can('users.delete'),
  },
}))
const available = computed(() => (Object.keys(actions.value) as BulkAction[]).filter((a) => actions.value[a].needs))

// ── Asking first ────────────────────────────────────────────────────────────

const action = ref<BulkAction>()
const asking = computed({ get: () => !!action.value, set: (v) => { if (!v && status.value === 'idle') action.value = undefined } })
const info = computed(() => (action.value ? actions.value[action.value] : undefined))
const status = ref<ButtonStatus>('idle')
const groupId = ref<string>()
const groupError = ref<string>()
const giveOut = ref<'show' | 'csv'>('show')
const giveOutOptions = [
  { label: 'Show them to me', value: 'show', description: 'Once, after they’re reset, with a CSV to download if you want it.' },
  { label: 'Download them as a CSV', value: 'csv', description: 'Straight away, without showing them.' },
]
const groupOptions = computed(() => props.groups.map((g) => ({ label: g.name, value: g.id })))

function ask(a: BulkAction) {
  groupId.value = undefined
  groupError.value = undefined
  giveOut.value = 'show'
  status.value = 'idle'
  action.value = a
}

// ── Doing it, and what happened ─────────────────────────────────────────────

const results = ref<BulkResult[]>([])
const summaryTitle = ref('')
const summaryOpen = ref(false)
const downloaded = ref(false)

async function run() {
  const a = action.value!
  const group = a === 'add-to-group' || a === 'remove-from-group'
  if (group && !groupId.value) {
    groupError.value = 'Choose a group'
    return
  }
  status.value = 'loading'
  try {
    const res = await api.bulk(props.orgId, a, props.selected.map((u) => u.id), group ? groupId.value : undefined)
    downloaded.value = a === 'reset-password' && giveOut.value === 'csv'
    if (downloaded.value) downloadCsv(res.results)
    results.value = res.results
    summaryTitle.value = actions.value[a].label
    status.value = 'idle'
    action.value = undefined
    summaryOpen.value = true
    emit('done')
  } catch (e) {
    status.value = 'idle'
    if (group) groupError.value = message(e)
    else notify({ type: 'error', title: 'Couldn’t do that', description: message(e) })
  }
}
</script>

<template>
  <Card v-if="selected.length && available.length">
    <div class="flex flex-wrap items-center gap-2">
      <p class="mr-2 text-sm font-bold">{{ count }} selected</p>
      <Button
        v-for="a in available"
        :key="a"
        size="sm"
        :variant="actions[a].danger ? 'danger' : 'basic'"
        @click="ask(a)"
      >
        {{ actions[a].label }}
      </Button>
    </div>
  </Card>

  <Slideover v-model:open="asking" :title="info?.title" :description="info?.description" initial-focus="auto">
    <template v-if="action === 'add-to-group' || action === 'remove-from-group' || action === 'reset-password'" #body>
      <Select
        v-if="action !== 'reset-password'"
        v-model="groupId"
        label="Group"
        :options="groupOptions"
        placeholder="Choose a group"
        :error-text="groupError"
        searchable
      />
      <RadioGroup v-else v-model="giveOut" label="New passwords" :options="giveOutOptions" />
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">Cancel</Button>
      <Button :variant="info?.danger ? 'danger' : 'primary'" :status="status" :loading-text="info?.loading" @click="run">
        {{ info?.confirm }}
      </Button>
    </template>
  </Slideover>

  <BulkSummary v-model:open="summaryOpen" :title="summaryTitle" :results="results" :downloaded="downloaded" />
</template>
