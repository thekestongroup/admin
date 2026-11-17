<script setup lang="ts">
import { Pencil, Trash2, UserPlus, Users } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  Menu,
  type MenuItem,
  Select,
  Slideover,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { api, type AdminRole, type Guest, type PermissionId } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Guests: people from other organisations who work in Keston Admin as
 * members of this one (Users page). Invite one by email (their own
 * organisation must allow guests), choose their admin roles here, or remove
 * them. Their account stays with their home organisation: nothing here
 * touches their password, MFA or profile.
 */
const props = defineProps<{
  orgId: string
  /** The caller's permissions here. */
  can: (p: PermissionId) => boolean
  roles: AdminRole[]
  /** The caller's own permissions, for which roles they can give. */
  myPermissions: PermissionId[]
  globalAdmin: boolean
}>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const guests = ref<Guest[]>([])
const loading = ref(true)
const loadError = ref<string>()
async function load() {
  try {
    guests.value = await api.guests(props.orgId)
    loadError.value = undefined
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const roleName = (id: string) => props.roles.find((r) => r.id === id)?.label ?? id

// ── Invite ──────────────────────────────────────────────────────────────────

const inviting = defineModel<boolean>('inviting', { default: false })
const email = ref('')
const emailError = ref<string>()
const inviteStatus = ref<ButtonStatus>('idle')
async function invite() {
  emailError.value = undefined
  inviteStatus.value = 'loading'
  try {
    const g = await api.inviteGuest(props.orgId, email.value)
    notify({ type: 'success', title: t('guests.invitePanel.sent'), description: t('guests.invitePanel.sentDescription', { name: g.name }) })
    inviting.value = false
    email.value = ''
    await load()
  } catch (e) {
    // The message says what's wrong (can't be delivered, already invited…).
    emailError.value = message(e)
  } finally {
    inviteStatus.value = 'idle'
  }
}

// ── Roles ───────────────────────────────────────────────────────────────────

const editing = ref<Guest>()
const chosen = ref<string[]>([])
const editingOpen = computed({ get: () => !!editing.value, set: (v) => !v && (editing.value = undefined) })
const rolesStatus = ref<ButtonStatus>('idle')
const rolesError = ref<string>()
const canGive = (r: AdminRole) => props.globalAdmin || r.permissions.every((p) => props.myPermissions.includes(p))
const roleOptions = computed(() => props.roles.map((r) => ({ label: r.label, value: r.id, description: r.description, disabled: !canGive(r) })))
function edit(g: Guest) {
  editing.value = g
  chosen.value = [...g.roles]
  rolesError.value = undefined
}
async function saveRoles() {
  if (!editing.value) return
  rolesStatus.value = 'loading'
  rolesError.value = undefined
  try {
    await api.setGuestRoles(props.orgId, editing.value.id, chosen.value)
    notify({ type: 'success', title: t('guests.rolesPanel.saved') })
    editing.value = undefined
    await load()
  } catch (e) {
    rolesError.value = message(e)
  } finally {
    rolesStatus.value = 'idle'
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────

const removing = ref<Guest>()
const removingOpen = computed({ get: () => !!removing.value, set: (v) => !v && (removing.value = undefined) })
const removeStatus = ref<ButtonStatus>('idle')
async function remove() {
  const g = removing.value
  if (!g) return
  removeStatus.value = 'loading'
  try {
    await api.removeGuest(props.orgId, g.id)
    notify({ type: 'success', title: g.status === 'pending' ? t('guests.withdrawn') : t('guests.removed') })
    removing.value = undefined
    await load()
  } catch (e) {
    notify({ type: 'error', title: t('guests.couldntRemove'), description: message(e) })
  } finally {
    removeStatus.value = 'idle'
  }
}

const columns = computed<TableColumn<Guest>[]>(() => [
  { key: 'name', label: t('guests.columns.name'), rowHeader: true },
  { key: 'from', label: t('guests.columns.from') },
  { key: 'access', label: t('guests.columns.access') },
  { key: 'status', label: t('guests.columns.status') },
  { key: 'actions', label: '', align: 'end' },
])
function actions(g: Guest): MenuItem[] {
  const out: MenuItem[] = []
  if (g.status === 'accepted' && props.can('permissions.assign'))
    out.push({ label: t('guests.edit'), icon: Pencil, onSelect: () => edit(g) })
  if (props.can('users.delete'))
    out.push({ label: g.status === 'pending' ? t('guests.withdraw') : t('guests.remove'), icon: Trash2, onSelect: () => (removing.value = g) })
  return out
}
</script>

<template>
  <Card padding="none" :title="t('guests.title')" :description="t('guests.description')">
    <template v-if="can('users.create')" #actions>
      <Button size="sm" @click="inviting = true">
        <template #leading><UserPlus /></template>
        {{ t('guests.invite') }}
      </Button>
    </template>
    <EmptyState v-if="loadError" size="sm" :icon="Users" :title="t('guests.couldntLoad')" :description="loadError" />
    <Table v-else :columns="columns" :rows="guests" row-key="id" :loading="loading" :caption="t('guests.title')">
      <template #cell-name="{ row }">
        <span>{{ row.name }}</span>
        <Badge size="sm" color="blue" class="ml-1">{{ t('guests.badge') }}</Badge>
        <div class="text-xs text-black/65">{{ row.email }}</div>
      </template>
      <template #cell-from="{ row }">{{ row.homeOrganisationName }}</template>
      <template #cell-access="{ row }">
        <span v-if="row.status === 'pending'" class="text-black/65">{{ t('guests.invitedBy', { name: row.invitedByName }) }}</span>
        <span v-else-if="row.roles.length">{{ row.roles.map(roleName).join(', ') }}</span>
        <span v-else class="text-black/65">{{ t('guests.noRoles') }}</span>
      </template>
      <template #cell-status="{ row }">
        <Badge v-if="row.status === 'pending'" size="sm" color="yellow">{{ t('guests.pending') }}</Badge>
        <Badge v-else-if="!row.active" size="sm" color="basic" :title="t('guests.onHoldHelp')">{{ t('guests.onHold') }}</Badge>
        <Badge v-else size="sm" color="green">{{ t('users.status.active') }}</Badge>
      </template>
      <template #cell-actions="{ row }">
        <Menu v-if="actions(row).length" :items="actions(row)" :label="t('common.actionsFor', { name: row.name })" size="sm" />
      </template>
      <template #empty>
        <EmptyState size="sm" :icon="Users" :title="t('guests.none')" :description="t('guests.noneDescription')" class="p-0" />
      </template>
    </Table>
  </Card>

  <Slideover v-model:open="inviting" :title="t('guests.invitePanel.title')" :description="t('guests.invitePanel.description')">
    <template #body>
      <form id="invite-guest" @submit.prevent="invite">
        <Input
          v-model="email"
          type="email"
          autocomplete="off"
          :label="t('guests.invitePanel.email')"
          :placeholder="t('guests.invitePanel.emailPlaceholder')"
          :error-text="emailError"
        />
      </form>
    </template>
    <template #footer="{ close }">
      <Button :disabled="inviteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="primary" type="submit" form="invite-guest" :status="inviteStatus" :disabled="!email.trim()">
        {{ t('guests.invitePanel.send') }}
      </Button>
    </template>
  </Slideover>

  <Slideover
    v-model:open="editingOpen"
    :title="t('guests.rolesPanel.title', { name: editing?.name ?? '' })"
    :description="t('guests.rolesPanel.description', { name: editing?.name ?? '' })"
  >
    <template #body>
      <Select
        v-model="chosen"
        :label="t('guests.rolesPanel.roles')"
        :helper="t('guests.rolesPanel.rolesHelper')"
        :options="roleOptions"
        :error-text="rolesError"
        multiple
        searchable
      />
    </template>
    <template #footer="{ close }">
      <Button :disabled="rolesStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="primary" :status="rolesStatus" @click="saveRoles">{{ t('guests.rolesPanel.save') }}</Button>
    </template>
  </Slideover>

  <Slideover
    v-model:open="removingOpen"
    :title="removing?.status === 'pending' ? t('guests.withdrawTitle', { name: removing?.name ?? '' }) : t('guests.removeTitle', { name: removing?.name ?? '' })"
    :description="removing?.status === 'pending' ? t('guests.withdrawDescription') : t('guests.removeDescription')"
  >
    <template #footer="{ close }">
      <Button :disabled="removeStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="danger" :status="removeStatus" @click="remove">
        {{ removing?.status === 'pending' ? t('guests.withdrawConfirm') : t('guests.removeConfirm') }}
      </Button>
    </template>
  </Slideover>
</template>
