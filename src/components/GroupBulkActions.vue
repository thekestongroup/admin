<script setup lang="ts">
import { Plus, UsersRound, X } from '@lucide/vue'
import { Button, type ButtonStatus, Select, Slideover, type PageHeaderAction, useNotifications } from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type BulkResult, type Group, type GroupBulkResult, type User } from '../lib/api'
import GroupBulkSummary from './GroupBulkSummary.vue'

const { t } = useI18n()

/**
 * The Groups page's action bar (PageHeader shows it) and the panels behind
 * it, like the Users page's BulkActions. With nobody ticked: New group. With
 * groups ticked: how many, and what can be done to them all at once (manage
 * members: users to add and users to remove, applied to every ticked group),
 * with a summary of what changed. Keston ID checks each group and user, as
 * for one.
 */
const props = defineProps<{
  orgId: string
  selected: Group[]
  /** Can create groups. */
  canCreate: boolean
  /** Can change who's in groups. */
  canManage: boolean
}>()
const emit = defineEmits<{ done: []; new: []; clear: [] }>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const count = computed(() => t('groupBulk.selected', props.selected.length))

const actions = computed<PageHeaderAction[]>(() => {
  if (!props.selected.length) return props.canCreate ? [{ label: t('groups.newGroup'), icon: Plus, onSelect: () => emit('new') }] : []
  const out: PageHeaderAction[] = []
  if (props.canManage) out.push({ label: t('groupBulk.manageMembers'), icon: UsersRound, onSelect: ask })
  out.push({ label: t('bulk.clearSelection'), icon: X, onSelect: () => emit('clear') })
  return out
})
defineExpose({ actions, count: computed(() => (props.selected.length ? count.value : '')) })

// ── Manage members ──────────────────────────────────────────────────────────

const open = ref(false)
const status = ref<ButtonStatus>('idle')
const users = ref<User[]>([])
const loadingUsers = ref(false)
const addUsers = ref<string[]>([])
const removeUsers = ref<string[]>([])
const errors = ref<Record<string, string | undefined>>({})

/** Only users you can change can be added or removed. */
const userOptions = computed(() =>
  users.value.filter((u) => u.canChange && !u.support).map((u) => ({ label: u.name, value: u.id, description: u.email })),
)

async function ask() {
  addUsers.value = []
  removeUsers.value = []
  errors.value = {}
  status.value = 'idle'
  open.value = true
  if (users.value.length) return
  loadingUsers.value = true
  try {
    users.value = await api.users(props.orgId)
  } catch (e) {
    open.value = false
    notify({ type: 'error', title: t('users.couldntLoad'), description: message(e) })
  } finally {
    loadingUsers.value = false
  }
}

const nameOf = (id: string) => users.value.find((u) => u.id === id)?.name

function check(): boolean {
  errors.value = {}
  if (!addUsers.value.length && !removeUsers.value.length) errors.value.add = t('groupBulk.chooseOne')
  const both = addUsers.value.find((id) => removeUsers.value.includes(id))
  if (both) errors.value.remove = t('groupBulk.inBoth', { name: nameOf(both) })
  return !Object.values(errors.value).some(Boolean)
}

const summaryOpen = ref(false)
const groupResults = ref<GroupBulkResult[]>([])
const skippedUsers = ref<BulkResult[]>([])

async function run() {
  if (!check()) return
  status.value = 'loading'
  try {
    const res = await api.bulkGroupMembers(props.orgId, props.selected.map((g) => g.id), addUsers.value, removeUsers.value)
    groupResults.value = res.groups
    skippedUsers.value = res.skippedUsers
    status.value = 'idle'
    open.value = false
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
  <Slideover
    v-model:open="open"
    :title="t('groupBulk.manageMembers')"
    :description="count"
    initial-focus="auto"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-black/65">{{ t('groupBulk.intro') }}</p>
        <Select
          v-model="addUsers"
          :label="t('groupBulk.addUsers')"
          :helper="t('groupBulk.addHelper', selected.length)"
          :options="userOptions"
          :placeholder="loadingUsers ? t('common.loading') : undefined"
          :error-text="errors.add"
          multiple
          searchable
        />
        <Select
          v-model="removeUsers"
          :label="t('groupBulk.removeUsers')"
          :helper="t('groupBulk.removeHelper', selected.length)"
          :options="userOptions"
          :placeholder="loadingUsers ? t('common.loading') : undefined"
          :error-text="errors.remove"
          multiple
          searchable
        />
      </div>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="primary" :status="status" :loading-text="t('common.saving')" @click="run">{{ t('groupBulk.confirm') }}</Button>
    </template>
  </Slideover>

  <GroupBulkSummary v-model:open="summaryOpen" :groups="groupResults" :skipped-users="skippedUsers" />
</template>
