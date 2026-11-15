<script setup lang="ts">
import { Lock, ShieldCheck, TriangleAlert, Users } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  EmptyState,
  PageHeader,
  Slideover,
  formatDateTime,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AddUserSlideover from '../components/AddUserSlideover.vue'
import BulkActions from '../components/BulkActions.vue'
import PasswordField from '../components/PasswordField.vue'
import { api, loadMe, type Group, type Organisation, type PermissionId, type Product, type User } from '../lib/api'

/**
 * An organisation's users: add, reset a password, disable or enable; tick
 * several for bulk actions. Deleted users are on their own page.
 */
const route = useRoute()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const users = ref<User[]>([])
const myId = ref<string>()
const iAmGlobalAdmin = ref(false)
const loading = ref(true)
const has = (p: PermissionId) => !!org.value?.permissions?.includes(p)

const loadError = ref<string>()

async function load() {
  users.value = await api.users(orgId)
  const ids = new Set(users.value.filter(selectable).map((u) => u.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
}

onMounted(async () => {
  try {
    const [o, me] = await Promise.all([api.organisation(orgId), loadMe()])
    org.value = o
    myId.value = me.user.id
    iAmGlobalAdmin.value = me.user.role === 'global_admin' && me.organisation.id === orgId
    await load()
    if (has('groups.manage') || has('permissions.assign')) groups.value = await api.groups(orgId)
  } catch (e) {
    loadError.value = message(e)
  } finally {
    loading.value = false
  }
})

// ── Selecting users, for bulk actions ───────────────────────────────────────

const bulkPerms: PermissionId[] = ['users.reset_password', 'users.status', 'users.delete', 'groups.manage', 'permissions.assign']
const canBulk = computed(() => bulkPerms.some(has))
/** Only users you can change can be ticked. */
const selectable = (u: User) => !!u.canChange && !u.support
const selected = ref(new Set<string>())
const groups = ref<Group[]>([])
const selectedUsers = computed(() => users.value.filter((u) => selected.value.has(u.id)))
const selectableCount = computed(() => users.value.filter(selectable).length)
const allSelected = computed<boolean | 'indeterminate'>(() =>
  !selected.value.size ? false : selected.value.size === selectableCount.value ? true : 'indeterminate',
)

function selectAll(on: boolean | 'indeterminate') {
  selected.value = new Set(on === true ? users.value.filter(selectable).map((u) => u.id) : [])
}

function selectRow(u: User, on: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (on === true) next.add(u.id)
  else next.delete(u.id)
  selected.value = next
}

async function bulkDone() {
  selected.value = new Set()
  await load()
}

const columns = computed<TableColumn<User>[]>(() => [
  ...(canBulk.value ? [{ key: 'select', label: 'Select', hideLabel: true, class: 'w-0' }] : []),
  { key: 'name', label: 'Name', rowHeader: true, sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'role', label: 'Role', sortable: true },
  { key: 'licences', label: 'Licences' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', hideLabel: true, align: 'end' },
])

// ── Add a user ──────────────────────────────────────────────────────────

const adding = ref(false)

// Product names, for the Licences column.
const products = ref<Product[]>([])
const productName = (id: string) => products.value.find((p) => p.id === id)?.name ?? id
onMounted(async () => {
  products.value = await api.products(orgId).catch(() => [])
})

// ── Reset a password ────────────────────────────────────────────────────────

const resetting = ref<User>()
const resetOpen = computed({ get: () => !!resetting.value, set: (v) => { if (!v) resetting.value = undefined } })
const newPassword = ref('')
const resetRequireChange = ref(true)
const resetValid = ref(false)
const resetError = ref<string>()
const resetStatus = ref<ButtonStatus>('idle')

function startReset(a: User) {
  newPassword.value = ''
  resetRequireChange.value = true
  resetError.value = undefined
  resetStatus.value = 'idle'
  resetting.value = a
}

async function reset() {
  const a = resetting.value!
  resetError.value = resetValid.value ? undefined : newPassword.value ? 'The password doesn’t meet every rule yet' : 'Enter a new password'
  if (resetError.value) return
  resetStatus.value = 'loading'
  try {
    await api.resetPassword(orgId, a.id, newPassword.value, resetRequireChange.value)
    await load()
    resetting.value = undefined
    notify({ type: 'success', title: 'Password reset', description: `${a.name} has been signed out everywhere, and can sign in with the new password.` })
  } catch (e) {
    resetStatus.value = 'idle'
    resetError.value = message(e)
  }
}

// ── Disable / enable ────────────────────────────────────────────────────────

const changing = ref<string>()
async function toggle(a: User) {
  const status = a.status === 'active' ? 'disabled' : 'active'
  changing.value = a.id
  try {
    await api.setStatus(orgId, a.id, status)
    await load()
    notify({
      type: 'success',
      title: status === 'disabled' ? 'User disabled' : 'User enabled',
      description: status === 'disabled' ? `${a.name} has been signed out and can’t sign in.` : `${a.name} can sign in again.`,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change the user', description: message(e) })
  } finally {
    changing.value = undefined
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Users">
      <BulkActions
        v-if="!loadError"
        :org-id="orgId"
        :selected="selectedUsers"
        :groups="groups"
        :can="has"
        @add="adding = true"
        @clear="selected = new Set()"
        @done="bulkDone"
      />
    </PageHeader>

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the users" :description="loadError" />
    </Card>

    <Card v-if="!loadError" padding="none">
      <Table
        :columns="columns"
        :rows="users"
        row-key="id"
        :loading="loading"
        caption="Users"
        :row-link="(row: User) => `/organisations/${orgId}/users/${row.id}`"
        :link-component="RouterLink"
      >
        <template #header-select>
          <Checkbox
            v-if="selectableCount"
            :model-value="allSelected"
            label="Select every user you can change"
            class="[&_label]:sr-only"
            @update:model-value="selectAll"
          />
        </template>
        <template #cell-select="{ row }">
          <Checkbox
            v-if="selectable(row)"
            :model-value="selected.has(row.id)"
            :label="`Select ${row.name}`"
            class="[&_label]:sr-only"
            @update:model-value="selectRow(row, $event)"
          />
        </template>
        <template #cell-name="{ row }">
          {{ row.name }}
          <Badge v-if="row.support" size="sm" color="blue" class="ml-1">Keston support</Badge>
          <span v-if="row.id === myId" class="text-black/65"> (you)</span>
        </template>
        <template #cell-role="{ row }">
          <Badge v-if="row.role === 'global_admin'" color="primary" size="sm">
            <template #leading><ShieldCheck /></template>
            Global admin
          </Badge>
          <span v-else>Member</span>
        </template>
        <template #cell-licences="{ row }">
          <span v-if="row.licences?.length">{{ row.licences.map(productName).join(', ') }}</span>
          <span v-else class="text-black/65">None</span>
        </template>
        <template #cell-status="{ row }">
          <Badge v-if="row.status === 'disabled'" color="basic" size="sm">Disabled</Badge>
          <Badge v-else-if="row.locked" color="yellow" size="sm">
            <template #leading><Lock /></template>
            Locked
          </Badge>
          <Badge v-else color="green" size="sm">Active</Badge>
        </template>
        <template #cell-actions="{ row }">
          <span v-if="row.support" class="text-xs text-black/65">Until {{ formatDateTime(row.expiresAt!) }}</span>
          <div v-else-if="row.canChange" class="flex justify-end gap-2">
            <Button v-if="has('users.reset_password')" size="sm" @click="startReset(row)">
              Reset password<span class="sr-only"> for {{ row.name }}</span>
            </Button>
            <Button
              v-if="row.id !== myId && has('users.status')"
              size="sm"
              :variant="row.status === 'active' ? 'ghost' : 'basic'"
              :status="changing === row.id ? 'loading' : 'idle'"
              @click="toggle(row)"
            >
              {{ row.status === 'active' ? 'Disable' : 'Enable' }}<span class="sr-only"> {{ row.name }}</span>
            </Button>
          </div>
        </template>
        <template #empty>
          <EmptyState size="sm" :icon="Users" title="No users yet" description="Add the people who sign in to Keston here." class="p-0" />
        </template>
      </Table>
    </Card>


    <!-- Add a user -->
    <AddUserSlideover
      v-model:open="adding"
      :org-id="orgId"
      :org="org"
      :global-admin="iAmGlobalAdmin"
      :can-assign-licences="has('users.licences')"
      @added="load"
    />

    <!-- Reset a password -->
    <Slideover
      v-model:open="resetOpen"
      :title="resetting ? `Reset ${resetting.name}’s password` : 'Reset password'"
      description="They’ll be signed out everywhere, and unlocked if they were locked out. Give them the new password securely."
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="reset">
          <PasswordField
            v-model="newPassword"
            v-model:valid="resetValid"
            label="New password"
            :organisation-id="orgId"
            :username="resetting?.username"
            :error-text="resetError"
          />
          <Checkbox v-model="resetRequireChange" label="Ask them to choose a new password when they next sign in" description="Recommended, so only they know their password." />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="resetStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="resetStatus" loading-text="Resetting" @click="reset">Reset password</Button>
      </template>
    </Slideover>
  </div>
</template>
