<script setup lang="ts">
import { ArchiveRestore, Ban, KeyRound, Trash2, UserPlus, Users, UsersRound, X } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Checkbox,
  Notification,
  type PageHeaderAction,
  RadioGroup,
  Select,
  Slideover,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import { ApiError, api, type BulkResult, type Group, type PermissionId, type User } from '../lib/api'
import BulkSummary from './BulkSummary.vue'
import PasswordField from './PasswordField.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The Users page's toolbar actions (PageHeader shows them) and the panels
 * behind them. With nobody ticked: add a
 * user or several, deleted users. With users ticked: how many, and what can be done to
 * them all at once (reset passwords, change sign-in status, manage group
 * memberships, delete). Each asks first, then shows what was done and who
 * was skipped (Keston ID checks each user, as for one). The Users page's
 * row menus use the same panels for one user (open()).
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
const titles = computed<Record<Kind, string>>(() => ({
  'reset-password': t('bulk.resetPassword.title'),
  'sign-in': t('bulk.signIn.title'),
  groups: t('bulk.groups.title'),
  delete: t('bulk.delete.title'),
}))

const count = computed(() => t('bulk.selected', props.selected.length))

/** Who the open panel acts on: one user from a row's menu, or everyone ticked. */
const only = ref<User>()
const targets = computed(() => (only.value ? [only.value] : props.selected))
const forWhom = computed(() => (only.value ? only.value.name : count.value))
const one = computed(() => targets.value.length === 1)

const actions = computed<PageHeaderAction[]>(() => {
  if (!props.selected.length) {
    return [
      ...(props.can('users.create')
        ? [
            { label: t('bulk.addUser'), icon: UserPlus, onSelect: () => emit('add') },
            { label: t('bulk.addMultiple'), icon: Users, to: `/organisations/${props.orgId}/users/add` },
          ]
        : []),
      { label: t('bulk.deletedUsers'), icon: ArchiveRestore, to: `/organisations/${props.orgId}/users/deleted` },
    ]
  }
  const out: PageHeaderAction[] = []
  if (props.can('users.reset_password')) out.push({ label: titles.value['reset-password'], icon: KeyRound, onSelect: () => ask('reset-password') })
  if (props.can('users.status')) out.push({ label: titles.value['sign-in'], icon: Ban, onSelect: () => ask('sign-in') })
  if (props.can('groups.manage') || props.can('permissions.assign'))
    out.push({ label: titles.value.groups, icon: UsersRound, onSelect: () => ask('groups') })
  if (props.can('users.delete')) out.push({ label: titles.value.delete, icon: Trash2, onSelect: () => ask('delete') })
  out.push({ label: t('bulk.clearSelection'), icon: X, onSelect: () => emit('clear') })
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

// Change sign-in status
const signIn = ref<'block' | 'allow'>('block')
const signInOptions = computed(() => [
  { label: t('bulk.signIn.blockLabel'), value: 'block', description: t('bulk.signIn.blockDescription') },
  { label: t('bulk.signIn.allowLabel'), value: 'allow', description: t('bulk.signIn.allowDescription') },
])

// Manage group memberships
const addTo = ref<string[]>([])
const removeFrom = ref<string[]>([])
const groupOptions = computed(() =>
  props.groups.map((g) => ({ label: g.name, value: g.id, description: t('bulk.groups.members', g.memberCount) })),
)

function ask(k: Kind, user?: User) {
  only.value = user
  errors.value = {}
  status.value = 'idle'
  autoPassword.value = true
  password.value = ''
  requireChange.value = true
  signIn.value = user?.status === 'disabled' ? 'allow' : 'block'
  addTo.value = []
  removeFrom.value = []
  kind.value = k
}

const confirm = computed(() => {
  switch (kind.value) {
    case 'reset-password':
      return { label: t('bulk.resetPassword.confirm'), loading: t('bulk.resetPassword.loading'), danger: false }
    case 'sign-in':
      return signIn.value === 'block'
        ? { label: t('bulk.signIn.blockConfirm'), loading: t('bulk.signIn.blocking'), danger: true }
        : { label: t('bulk.signIn.allowConfirm'), loading: t('bulk.signIn.allowing'), danger: false }
    case 'groups':
      return { label: t('bulk.groups.confirm'), loading: t('common.saving'), danger: false }
    default:
      return { label: t('bulk.delete.title'), loading: t('common.deleting'), danger: true }
  }
})

// ── Doing it, and what happened ─────────────────────────────────────────────

const results = ref<BulkResult[]>([])
const summaryTitle = ref('')
const summaryOpen = ref(false)

defineExpose({
  /** The Users page's toolbar: add users with nobody ticked, else what can be done to them. */
  actions,
  /** "2 users selected", or "" with nobody ticked. */
  count: computed(() => (props.selected.length ? count.value : '')),
  /** One user's panel, from their row's menu. */
  open: (k: Kind, user: User) => ask(k, user),
})

function check(): boolean {
  errors.value = {}
  if (kind.value === 'reset-password' && !autoPassword.value && !passwordValid.value)
    errors.value.password = password.value ? t('password.notYetValid') : t('password.enter')
  if (kind.value === 'groups') {
    if (!addTo.value.length && !removeFrom.value.length) errors.value.add = t('bulk.groups.chooseOne')
    const both = addTo.value.find((id) => removeFrom.value.includes(id))
    if (both) errors.value.remove = t('bulk.groups.inBoth', { name: props.groups.find((g) => g.id === both)?.name })
  }
  return !Object.values(errors.value).some(Boolean)
}

async function run() {
  const k = kind.value!
  if (!check()) return
  const ids = targets.value.map((u) => u.id)
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
    results.value = res.results
    summaryTitle.value = k === 'sign-in' ? (signIn.value === 'block' ? t('bulk.signIn.blockConfirm') : t('bulk.signIn.allowConfirm')) : titles.value[k]
    status.value = 'idle'
    kind.value = undefined
    summaryOpen.value = true
    emit('done')
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors.value[e.field] = e.message
    else notify({ type: 'error', title: t('bulk.couldntDoThat'), description: message(e) })
  }
}
</script>

<template>

  <Slideover v-model:open="open" :title="kind ? titles[kind] : ''" :description="forWhom" initial-focus="auto">
    <template #body>
      <!-- Reset password -->
      <div v-if="kind === 'reset-password'" class="flex flex-col gap-4">
        <p class="text-sm text-black/65">{{ t('bulk.resetPassword.intro') }}</p>
        <Checkbox
          v-model="autoPassword"
          :label="t('password.auto')"
          :description="one ? t('bulk.resetPassword.autoOne') : t('bulk.resetPassword.autoMany')"
        />
        <template v-if="!autoPassword">
          <Notification
            v-if="!one"
            type="warning"
            :title="t('bulk.resetPassword.sameTitle')"
            :description="t('bulk.resetPassword.sameDescription')"
            :dismissible="false"
          />
          <PasswordField v-model="password" v-model:valid="passwordValid" :organisation-id="orgId" :error-text="errors.password" />
        </template>
        <Checkbox
          v-model="requireChange"
          :label="t('bulk.resetPassword.require')"
          :description="t('password.requireChangeDescription')"
        />
      </div>

      <!-- Change sign-in status -->
      <div v-else-if="kind === 'sign-in'" class="flex flex-col gap-4">
        <RadioGroup v-model="signIn" :label="t('bulk.signIn.label')" :options="signInOptions" />
        <p class="text-sm text-black/65">
          {{ t('bulk.signIn.explanation') }}
        </p>
      </div>

      <!-- Manage group memberships -->
      <div v-else-if="kind === 'groups'" class="flex flex-col gap-4">
        <p class="text-sm text-black/65">{{ t('bulk.groups.intro') }}</p>
        <Select
          v-model="addTo"
          :label="t('bulk.groups.addTo')"
          :helper="one ? t('bulk.groups.addOne') : t('bulk.groups.addMany')"
          :options="groupOptions"
          :error-text="errors.add"
          multiple
          searchable
        />
        <Select
          v-model="removeFrom"
          :label="t('bulk.groups.removeFrom')"
          :helper="one ? t('bulk.groups.removeOne') : t('bulk.groups.removeMany')"
          :options="groupOptions"
          :error-text="errors.remove"
          multiple
          searchable
        />
      </div>

      <!-- Delete -->
      <p v-else-if="kind === 'delete'" class="text-sm text-black/65">
        {{ t('bulk.delete.explanation') }}
      </p>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button :variant="confirm.danger ? 'danger' : 'primary'" :status="status" :loading-text="confirm.loading" @click="run">
        {{ confirm.label }}
      </Button>
    </template>
  </Slideover>

  <BulkSummary v-model:open="summaryOpen" :title="summaryTitle" :results="results" />
</template>
