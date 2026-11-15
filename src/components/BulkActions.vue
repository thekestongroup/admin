<script setup lang="ts">
import { ArchiveRestore, Ban, KeyRound, Trash2, UserPlus, Users, UsersRound, X } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Checkbox,
  Notification,
  RadioGroup,
  Select,
  Slideover,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import { ApiError, api, type BulkResult, type Group, type PermissionId, type User } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import ActionBar, { type Action } from './ActionBar.vue'
import BulkSummary from './BulkSummary.vue'
import PasswordField from './PasswordField.vue'

/**
 * The Users page's action row, under its title. With nobody ticked: add a
 * user or several, deleted users. With users ticked: how many, and what can be done to
 * them all at once (reset passwords, change sign-in status, manage group
 * memberships, delete). Each asks first, then shows what was done and who
 * was skipped (Keston ID checks each user, as for one).
 */
const props = defineProps<{
  orgId: string
  selected: User[]
  groups: Group[]
  can: (p: PermissionId) => boolean
}>()
const emit = defineEmits<{ done: []; add: []; clear: [] }>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Kind = 'reset-password' | 'sign-in' | 'groups' | 'delete'
const titles: Record<Kind, string> = {
  'reset-password': 'Reset password',
  'sign-in': 'Change sign-in status',
  groups: 'Manage group memberships',
  delete: 'Delete users',
}

const count = computed(() => `${props.selected.length} ${props.selected.length === 1 ? 'user' : 'users'} selected`)

const actions = computed<Action[]>(() => {
  if (!props.selected.length) {
    return [
      ...(props.can('users.create')
        ? [
            { label: 'Add user', icon: UserPlus, onSelect: () => emit('add') },
            { label: 'Add multiple users', icon: Users, to: `/organisations/${props.orgId}/users/add` },
          ]
        : []),
      { label: 'Deleted users', icon: ArchiveRestore, to: `/organisations/${props.orgId}/users/deleted` },
    ]
  }
  const out: Action[] = []
  if (props.can('users.reset_password')) out.push({ label: titles['reset-password'], icon: KeyRound, onSelect: () => ask('reset-password') })
  if (props.can('users.status')) out.push({ label: titles['sign-in'], icon: Ban, onSelect: () => ask('sign-in') })
  if (props.can('groups.manage') || props.can('permissions.assign'))
    out.push({ label: titles.groups, icon: UsersRound, onSelect: () => ask('groups') })
  if (props.can('users.delete')) out.push({ label: titles.delete, icon: Trash2, danger: true, onSelect: () => ask('delete') })
  out.push({ label: 'Clear selection', icon: X, onSelect: () => emit('clear') })
  return out
})

// ── Asking first ────────────────────────────────────────────────────────────

const kind = ref<Kind>()
const open = computed({ get: () => !!kind.value, set: (v) => { if (!v && status.value === 'idle') kind.value = undefined } })
const status = ref<ButtonStatus>('idle')
const errors = ref<Record<string, string | undefined>>({})

// Reset password
const autoPassword = ref(true)
const password = ref('')
const passwordValid = ref(false)
const requireChange = ref(true)
const giveOut = ref<'show' | 'csv'>('show')
const giveOutOptions = [
  { label: 'Show them to me', value: 'show', description: 'Once, after they’re reset, with a CSV to download if you want it.' },
  { label: 'Download them as a CSV', value: 'csv', description: 'Straight away, without showing them.' },
]

// Change sign-in status
const signIn = ref<'block' | 'allow'>('block')
const signInOptions = [
  { label: 'Block users from signing in', value: 'block', description: 'They’re signed out of Keston and every app straight away.' },
  { label: 'Allow users to sign in', value: 'allow', description: 'They can sign in again, as before.' },
]

// Manage group memberships
const addTo = ref<string[]>([])
const removeFrom = ref<string[]>([])
const groupOptions = computed(() =>
  props.groups.map((g) => ({ label: g.name, value: g.id, description: g.memberCount === 1 ? '1 user' : `${g.memberCount} users` })),
)

function ask(k: Kind) {
  errors.value = {}
  status.value = 'idle'
  autoPassword.value = true
  password.value = ''
  requireChange.value = true
  giveOut.value = 'show'
  signIn.value = 'block'
  addTo.value = []
  removeFrom.value = []
  kind.value = k
}

const confirm = computed(() => {
  switch (kind.value) {
    case 'reset-password':
      return { label: 'Reset passwords', loading: 'Resetting', danger: false }
    case 'sign-in':
      return signIn.value === 'block'
        ? { label: 'Block sign-in', loading: 'Blocking', danger: true }
        : { label: 'Allow sign-in', loading: 'Allowing', danger: false }
    case 'groups':
      return { label: 'Save memberships', loading: 'Saving', danger: false }
    default:
      return { label: 'Delete users', loading: 'Deleting', danger: true }
  }
})

// ── Doing it, and what happened ─────────────────────────────────────────────

const results = ref<BulkResult[]>([])
const summaryTitle = ref('')
const summaryOpen = ref(false)
const downloaded = ref(false)

function check(): boolean {
  errors.value = {}
  if (kind.value === 'reset-password' && !autoPassword.value && !passwordValid.value)
    errors.value.password = password.value ? 'The password doesn’t meet every rule yet' : 'Enter a password'
  if (kind.value === 'groups') {
    if (!addTo.value.length && !removeFrom.value.length) errors.value.add = 'Choose at least one group'
    const both = addTo.value.find((id) => removeFrom.value.includes(id))
    if (both) errors.value.remove = `${props.groups.find((g) => g.id === both)?.name} is in both lists`
  }
  return !Object.values(errors.value).some(Boolean)
}

async function run() {
  const k = kind.value!
  if (!check()) return
  const ids = props.selected.map((u) => u.id)
  status.value = 'loading'
  try {
    let res: { results: BulkResult[] }
    if (k === 'reset-password')
      res = await api.bulkResetPassword(props.orgId, ids, {
        password: autoPassword.value ? undefined : password.value,
        requirePasswordChange: requireChange.value,
      })
    else if (k === 'sign-in') res = await api.bulk(props.orgId, signIn.value === 'block' ? 'disable' : 'enable', ids)
    else if (k === 'groups') res = await api.bulkGroups(props.orgId, ids, addTo.value, removeFrom.value)
    else res = await api.bulk(props.orgId, 'delete', ids)
    downloaded.value = k === 'reset-password' && autoPassword.value && giveOut.value === 'csv'
    if (downloaded.value) downloadCsv(res.results)
    results.value = res.results
    summaryTitle.value = k === 'sign-in' ? (signIn.value === 'block' ? 'Block sign-in' : 'Allow sign-in') : titles[k]
    status.value = 'idle'
    kind.value = undefined
    summaryOpen.value = true
    emit('done')
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors.value[e.field] = e.message
    else notify({ type: 'error', title: 'Couldn’t do that', description: message(e) })
  }
}
</script>

<template>
  <ActionBar :actions="actions" :label="selected.length ? `Actions for ${count}` : 'User actions'">
    <p v-if="selected.length" class="mr-2 ml-2.5 text-sm font-bold" aria-live="polite">{{ count }}</p>
  </ActionBar>

  <Slideover v-model:open="open" :title="kind ? titles[kind] : ''" :description="count" initial-focus="auto">
    <template #body>
      <!-- Reset password -->
      <div v-if="kind === 'reset-password'" class="flex flex-col gap-4">
        <p class="text-sm text-black/65">They’re signed out everywhere, and unlocked if they were locked out.</p>
        <Checkbox
          v-model="autoPassword"
          label="Automatically create a password"
          description="Each user gets their own, which meets your password policy."
        />
        <template v-if="!autoPassword">
          <Notification
            type="warning"
            title="Everyone gets the same password"
            description="This will apply the same password for all the selected users. For security, we suggest requiring these users to change their password when they first sign in."
            :dismissible="false"
          />
          <PasswordField v-model="password" v-model:valid="passwordValid" :organisation-id="orgId" :error-text="errors.password" />
        </template>
        <Checkbox
          v-model="requireChange"
          label="Require these users to change their passwords on next sign in"
          description="Recommended, so only they know their password."
        />
        <RadioGroup v-if="autoPassword" v-model="giveOut" label="New passwords" :options="giveOutOptions" />
      </div>

      <!-- Change sign-in status -->
      <div v-else-if="kind === 'sign-in'" class="flex flex-col gap-4">
        <RadioGroup v-model="signIn" label="Sign-in status" :options="signInOptions" />
        <p class="text-sm text-black/65">
          Blocking someone signs them out of Keston and every app straight away, and stops them signing in until
          they’re allowed again. Their account, groups and licences stay as they are. It’s a good idea to block an
          account you think has been compromised, then reset its password.
        </p>
      </div>

      <!-- Manage group memberships -->
      <div v-else-if="kind === 'groups'" class="flex flex-col gap-4">
        <p class="text-sm text-black/65">Groups give their members apps and permissions.</p>
        <Select
          v-model="addTo"
          label="Add to groups"
          helper="Everyone selected joins these groups."
          :options="groupOptions"
          :error-text="errors.add"
          multiple
          searchable
        />
        <Select
          v-model="removeFrom"
          label="Remove from groups"
          helper="Everyone selected leaves these groups, if they’re in them."
          :options="groupOptions"
          :error-text="errors.remove"
          multiple
          searchable
        />
      </div>

      <!-- Delete -->
      <p v-else-if="kind === 'delete'" class="text-sm text-black/65">
        They’re signed out everywhere and can’t sign in. For 30 days you can restore them, with their groups, from
        Deleted users; then they’re removed for good.
      </p>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">Cancel</Button>
      <Button :variant="confirm.danger ? 'danger' : 'primary'" :status="status" :loading-text="confirm.loading" @click="run">
        {{ confirm.label }}
      </Button>
    </template>
  </Slideover>

  <BulkSummary v-model:open="summaryOpen" :title="summaryTitle" :results="results" :downloaded="downloaded" />
</template>
