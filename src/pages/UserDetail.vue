<script setup lang="ts">
import { AppWindow, ImageUp, KeyRound, Pencil, Plus, RectangleEllipsis, ShieldOff, Ticket, Trash2, TriangleAlert, UserRound } from '@lucide/vue'
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Link,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  type PageHeaderAction,
  Tabs,
  SummaryList,
  formatDate,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DeleteUserCard from '../components/DeleteUserCard.vue'
import AdminRolesCard from '../components/AdminRolesCard.vue'
import LicencesCard from '../components/LicencesCard.vue'
import UserAppsCard from '../components/UserAppsCard.vue'
import PasswordField from '../components/PasswordField.vue'
import RecentActivity from '../components/RecentActivity.vue'
import SignInCard from '../components/SignInCard.vue'
import RemovePasskeysSlideover from '../components/RemovePasskeysSlideover.vue'
import { ApiError, api, loadMe, type Group, type Organisation, type Permission, type PermissionId, type User, type UserDetail } from '../lib/api'

/**
 * One user: their profile (admins can always change it, whatever the
 * organisation lets people change themselves), password, status, and their
 * groups and permissions. What you can do depends on your permissions, and
 * only for users with the same permissions as you or fewer.
 */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const userId = route.params.userId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const user = ref<UserDetail>()
const myId = ref<string>()
const iAmGlobalAdmin = ref(false)
const catalog = ref<Permission[]>([])
/** You can do this to this user: your permission, and they're not above you. */
const can = (p: PermissionId) => !!org.value?.permissions?.includes(p) && !!user.value?.canChange
/** Keep their groups and permissions when an update returns just the user. */
const merge = (u: User) => (user.value = { ...user.value!, ...u })
const error = ref<string>()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

onMounted(async () => {
  try {
    const [o, a, me, perms, groups] = await Promise.all([
      api.organisation(orgId),
      api.user(orgId, userId),
      loadMe(),
      api.permissions(),
      api.groups(orgId),
    ])
    allGroups.value = groups
    org.value = o
    user.value = a
    myId.value = me.user.id
    iAmGlobalAdmin.value = me.user.role === 'global_admin' && me.organisation.id === orgId
    catalog.value = perms
  } catch (e) {
    error.value = message(e)
  }
})

const isMe = computed(() => user.value?.id === myId.value)

// The open tab, kept in the URL (?tab=licences) so it survives a reload.
const tabs = [
  { value: 'account', label: 'Account', icon: UserRound },
  { value: 'licences', label: 'Licences & Apps', icon: AppWindow },
]
const tab = computed({
  get: () => (route.query.tab === 'licences' ? 'licences' : 'account'),
  set: (v: string | undefined) => router.replace({ query: { ...route.query, tab: v === 'licences' ? 'licences' : undefined } }),
})

/** After their roles change: their permissions, as Keston ID now has them. */
async function reload() {
  user.value = await api.user(orgId, userId)
}
const details = computed(() =>
  user.value
    ? [
        { label: 'Name', value: user.value.name },
        { label: 'Email', value: user.value.email, description: 'They sign in with this.' },
        { label: 'Role', value: user.value.role === 'global_admin' ? 'Global admin' : user.value.roles.length ? 'Admin' : 'User' },
        { label: 'Password changed', value: formatDate(user.value.passwordChangedAt) },
        { label: 'User ID', value: user.value.id },
      ]
    : [],
)
const trail = computed(() => [
  { label: org.value?.name ?? 'Organisation', to: `/organisations/${orgId}` },
  { label: 'Users', to: `/organisations/${orgId}/users` },
  { label: user.value?.name ?? 'User' },
])

// ── Groups ──────────────────────────────────────────────────────────────────

const allGroups = ref<Group[]>([])
const mine = (p: PermissionId) => !!org.value?.permissions?.includes(p)
/** Who's in a group: Manage groups (or Give permissions); for a group that
 *  gives permissions, Give permissions and every one of them. And only for
 *  users you can change. */
function mayChange(g: Group) {
  if (!user.value?.canChange) return false
  return g.permissions.length ? mine('permissions.assign') && g.permissions.every(mine) : mine('groups.manage') || mine('permissions.assign')
}
const groupOptions = computed(() =>
  allGroups.value
    .filter((g) => !user.value?.groups.some((x) => x.id === g.id) && mayChange(g))
    .map((g) => ({
      label: g.name,
      value: g.id,
      description: g.permissions.length ? `Gives ${g.permissions.length} ${g.permissions.length === 1 ? 'permission' : 'permissions'}` : undefined,
    })),
)
const groupChoice = ref<string>()
const groupBusy = ref<string>()
async function addToGroup() {
  if (!groupChoice.value) return
  groupBusy.value = 'add'
  try {
    await api.addMember(orgId, groupChoice.value, userId)
    groupChoice.value = undefined
    user.value = await api.user(orgId, userId)
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t add them to the group', description: message(e) })
  } finally {
    groupBusy.value = undefined
  }
}
async function removeFromGroup(g: Group) {
  groupBusy.value = g.id
  try {
    await api.removeMember(orgId, g.id, userId)
    user.value = await api.user(orgId, userId)
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t remove them from the group', description: message(e) })
  } finally {
    groupBusy.value = undefined
  }
}

// ── Edit profile ────────────────────────────────────────────────────────────

const editing = ref(false)
const form = reactive({ name: '', username: '' })
const formErrors = reactive<Record<string, string | undefined>>({})
const saveStatus = ref<ButtonStatus>('idle')
const pictureBusy = ref(false)
const pictureError = ref<string>()
const fileInput = ref<HTMLInputElement>()

function startEdit() {
  const a = user.value!
  Object.assign(form, { name: a.name, username: a.username })
  for (const k of Object.keys(formErrors)) formErrors[k] = undefined
  pictureError.value = undefined
  saveStatus.value = 'idle'
  editing.value = true
}

async function save() {
  const a = user.value!
  const changes: { name?: string; username?: string } = {}
  if (form.name.trim() !== a.name) changes.name = form.name
  if (form.username.trim().toLowerCase() !== a.username) changes.username = form.username
  if (!Object.keys(changes).length) {
    editing.value = false
    return
  }
  saveStatus.value = 'loading'
  try {
    merge(await api.updateUser(orgId, userId, changes))
    editing.value = false
    notify({ type: 'success', title: 'User updated' })
  } catch (e) {
    saveStatus.value = 'idle'
    if (e instanceof ApiError && e.field) formErrors[e.field] = e.message
    else notify({ type: 'error', title: 'Couldn’t update the user', description: message(e) })
  }
}

async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  pictureBusy.value = true
  pictureError.value = undefined
  try {
    merge(await api.setUserPicture(orgId, userId, file))
  } catch (e) {
    pictureError.value = message(e)
  } finally {
    pictureBusy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function removePicture() {
  pictureBusy.value = true
  try {
    await api.removeUserPicture(orgId, userId)
    user.value = { ...user.value!, avatar: undefined }
  } catch (e) {
    pictureError.value = message(e)
  } finally {
    pictureBusy.value = false
  }
}

// ── Reset password ──────────────────────────────────────────────────────────

const resetting = ref(false)
const newPassword = ref('')
const resetRequireChange = ref(true)
const resetValid = ref(false)
const resetError = ref<string>()
const resetStatus = ref<ButtonStatus>('idle')

function startReset() {
  newPassword.value = ''
  resetRequireChange.value = true
  resetError.value = undefined
  resetStatus.value = 'idle'
  resetting.value = true
}

async function reset() {
  resetError.value = resetValid.value ? undefined : newPassword.value ? 'The password doesn’t meet every rule yet' : 'Enter a new password'
  if (resetError.value) return
  resetStatus.value = 'loading'
  try {
    await api.resetPassword(orgId, userId, newPassword.value, resetRequireChange.value)
    signInCard.value?.reload()
    user.value = await api.user(orgId, userId)
    resetting.value = false
    notify({ type: 'success', title: 'Password reset', description: `${user.value.name} has been signed out everywhere.` })
  } catch (e) {
    resetStatus.value = 'idle'
    resetError.value = message(e)
  }
}

// ── Turn off MFA (lost authenticator) ─────────────────────────────────────────

const signInCard = ref<InstanceType<typeof SignInCard>>()

// The toolbar: everyday actions, opening the same panels as the cards below
// (which are on the Account tab, so it's shown first).
async function onAccountTab(run: () => void) {
  tab.value = 'account'
  await nextTick()
  run()
}
const toolbar = computed<PageHeaderAction[]>(() => {
  const u = user.value
  if (!u || u.support) return []
  const out: PageHeaderAction[] = []
  if (can('users.reset_password')) out.push({ label: 'Reset password', icon: KeyRound, onSelect: () => onAccountTab(startReset) })
  if (can('users.mfa') && (u.mfa || u.passkeys > 0))
    out.push({ label: 'Reset MFA', icon: ShieldOff, onSelect: () => onAccountTab(() => (confirmMfaOff.value = true)) })
  if (can('users.reset_password'))
    out.push(
      signInCard.value?.passwordChangeRequired
        ? { label: 'Don’t require password change', icon: RectangleEllipsis, onSelect: () => onAccountTab(() => signInCard.value?.setPasswordChange(false)) }
        : { label: 'Require password change', icon: RectangleEllipsis, onSelect: () => onAccountTab(() => signInCard.value?.setPasswordChange(true)) },
    )
  if (can('users.access_pass') && u.status === 'active')
    out.push({ label: 'Issue access pass', icon: Ticket, onSelect: () => onAccountTab(() => signInCard.value?.startIssue()) })
  return out
})
const confirmMfaOff = ref(false)
const mfaStatus = ref<ButtonStatus>('idle')
async function turnOffMfa() {
  mfaStatus.value = 'loading'
  try {
    merge(await api.disableMfa(orgId, userId))
    confirmMfaOff.value = false
    notify({
      type: 'success',
      title: 'MFA turned off',
      description: `${user.value!.name} can sign in with their password now, and set MFA up again in their Keston account.`,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t turn off MFA', description: message(e) })
  } finally {
    mfaStatus.value = 'idle'
  }
}

const removingPasskeys = ref(false)
const passkeyCount = computed(() => {
  const n = user.value?.passkeys ?? 0
  return n === 1 ? '1 passkey' : `${n} passkeys`
})

// ── Disable / enable ────────────────────────────────────────────────────────

const toggling = ref(false)
async function toggle() {
  const a = user.value!
  const status = a.status === 'active' ? 'disabled' : 'active'
  toggling.value = true
  try {
    await api.setStatus(orgId, userId, status)
    user.value = await api.user(orgId, userId)
    notify({
      type: 'success',
      title: status === 'disabled' ? 'User disabled' : 'User enabled',
      description: status === 'disabled' ? `${a.name} has been signed out and can’t sign in.` : `${a.name} can sign in again.`,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change the user', description: message(e) })
  } finally {
    toggling.value = false
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the user" :description="error" />
    </Card>
    <div v-else-if="!user" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="user.name" :description="user.email" :toolbar="toolbar">
        <template #badge>
          <Badge v-if="user.status === 'disabled'" color="basic">Disabled</Badge>
          <Badge v-else-if="user.locked" color="yellow">Locked</Badge>
          <Badge v-else color="green">Active</Badge>
        </template>
      </PageHeader>

      <Card v-if="user.support">
        <p class="text-sm">
          This is a temporary Keston support account, there while {{ org?.name }} allows Keston support access (until
          {{ formatDate(user.expiresAt!) }}). It has no password, and it’s removed when access ends. End it on the
          organisation’s Overview.
        </p>
      </Card>

      <Card v-else-if="!user.canChange">
        <p class="text-sm">
          {{ user.name }} has permissions you don’t, so you can see them but not change them. Ask one of your global
          admins if something needs changing.
        </p>
      </Card>

      <Tabs v-model="tab" :tabs="tabs" label="User details">
        <template #account>
          <div class="flex flex-col gap-6">
              <Card title="Profile">
                <template v-if="can('users.edit')" #actions>
                  <Button size="sm" @click="startEdit">
                    <template #leading><Pencil /></template>
                    Edit
                  </Button>
                </template>
                <div class="flex flex-col gap-4 @sm:flex-row @sm:items-start @sm:gap-6">
                  <Avatar :user="{ name: user.name, avatar: user.avatar }" size="xl" decorative />
                  <SummaryList :items="details" class="min-w-0 flex-1" />
                </div>
              </Card>

              <Card v-if="can('users.reset_password')" title="Password" description="A reset signs them out everywhere, and unlocks them if they were locked out.">
                <div><Button @click="startReset">Reset password</Button></div>
              </Card>

              <Card v-if="!user.support" title="Multi-factor authentication (MFA)">
                <template #actions>
                  <Badge v-if="user.mfa" color="green">On</Badge>
                  <Badge v-else color="yellow">Off</Badge>
                </template>
                <div class="flex flex-col gap-3">
                  <p v-if="user.mfa" class="text-sm text-black/65">
                    They sign in with their password and then
                    <template v-if="user.passkeys">a passkey or security key ({{ passkeyCount }})</template>
                    <template v-else>a code from their authenticator app</template>, unless they sign in with a passkey alone.
                    If they’ve lost what they use, turn MFA off so they can sign in with their password, then set it up again.
                  </p>
                  <p v-else class="text-sm text-black/65">
                    They sign in with their password only. They can turn MFA on in their Keston account.
                  </p>
                  <div v-if="user.mfa && can('users.mfa')" class="flex flex-wrap gap-2">
                    <Button variant="danger" @click="confirmMfaOff = true">Turn off MFA</Button>
                    <Button v-if="user.passkeys" @click="removingPasskeys = true">Remove passkeys</Button>
                  </div>
                </div>
              </Card>

              <SignInCard
                v-if="!user.support"
                ref="signInCard"
                :org-id="orgId"
                :user="user"
                :can-require-password="can('users.reset_password')"
                :can-issue-passes="can('users.access_pass')"
              />

              <AdminRolesCard
                v-if="!user.support && !isMe && user.canChange && (iAmGlobalAdmin || can('permissions.assign'))"
                :org-id="orgId"
                :user="user"
                :i-am-global-admin="iAmGlobalAdmin"
                :my-permissions="org?.permissions ?? []"
                @changed="reload"
              />

              <Card
                v-if="!user.support"
                title="Groups and permissions"
                description="Their groups set their app access, and what they can do in Keston Admin."
              >
                <div class="flex flex-col gap-4">
                  <p v-if="user.role === 'global_admin'" class="text-sm">As a global admin, they can do everything.</p>
                  <ul v-else-if="user.permissions.length" class="flex flex-wrap gap-2" aria-label="Permissions">
                    <li v-for="p in catalog.filter((c) => user!.permissions.includes(c.id))" :key="p.id">
                      <Badge size="sm" color="primary">{{ p.label }}</Badge>
                    </li>
                  </ul>
                  <p v-else class="text-sm text-black/65">None. They can’t use Keston Admin.</p>
                  <div class="flex flex-col gap-3">
                    <p class="text-sm font-bold">Groups</p>
                    <ul v-if="user.groups.length" class="flex flex-col divide-y divide-black/10">
                      <li v-for="g in user.groups" :key="g.id" class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span class="flex min-w-0 flex-1 flex-col">
                          <Link :as="RouterLink" :to="`/organisations/${orgId}/groups/${g.id}`" class="truncate text-sm">{{ g.name }}</Link>
                          <span class="text-xs text-black/65">
                            {{ g.permissions.length ? `Gives ${g.permissions.length} ${g.permissions.length === 1 ? 'permission' : 'permissions'}` : 'App access only' }}
                          </span>
                        </span>
                        <Button
                          v-if="mayChange(allGroups.find((x) => x.id === g.id) ?? g)"
                          size="sm"
                          variant="ghost"
                          :status="groupBusy === g.id ? 'loading' : 'idle'"
                          @click="removeFromGroup(g)"
                        >
                          Remove<span class="sr-only"> from {{ g.name }}</span>
                        </Button>
                      </li>
                    </ul>
                    <p v-else class="text-sm text-black/65">Not in any groups.</p>
                    <div v-if="groupOptions.length" class="flex items-start gap-2">
                      <Select v-model="groupChoice" label="Add to a group" :options="groupOptions" placeholder="Choose a group" class="flex-1" />
                      <Button
                        class="mt-6.5 shrink-0"
                        :disabled="!groupChoice"
                        :status="groupBusy === 'add' ? 'loading' : 'idle'"
                        loading-text="Adding"
                        @click="addToGroup"
                      >
                        <template #leading><Plus /></template>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card v-if="!isMe && can('users.status')" title="Access" :description="user.status === 'active' ? 'Disabling signs them out of Keston and every app.' : 'They can’t sign in.'">
                <div>
                  <Button :variant="user.status === 'active' ? 'danger' : 'primary'" :status="toggling ? 'loading' : 'idle'" @click="toggle">
                    {{ user.status === 'active' ? 'Disable user' : 'Enable user' }}
                  </Button>
                </div>
              </Card>

              <RecentActivity v-if="org?.permissions?.includes('reports.view')" :org-id="orgId" :user-id="userId" />
              <DeleteUserCard v-if="!isMe && can('users.delete')" :org-id="orgId" :user="user" />
          </div>
        </template>
        <template #licences>
          <div class="flex flex-col gap-6">
              <LicencesCard
                v-if="!user.support"
                v-model="user.licences"
                :org-id="orgId"
                :user-id="userId"
                :name="user.name"
                :can-edit="can('users.licences')"
              />
            <UserAppsCard :org-id="orgId" :user-id="userId" :name="user.name" />
          </div>
        </template>
      </Tabs>
    </template>

    <Slideover v-model:open="editing" title="Edit user" initial-focus="auto">
      <template #body>
        <form v-if="user" class="flex flex-col gap-6" novalidate @submit.prevent="save">
          <div class="flex flex-col gap-3">
            <p class="text-sm font-bold">Profile picture</p>
            <div class="flex items-center gap-4">
              <Avatar :user="{ name: user.name, avatar: user.avatar }" size="xl" decorative />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" :status="pictureBusy ? 'loading' : 'idle'" loading-text="Uploading" @click="fileInput?.click()">
                  <template #leading><ImageUp /></template>
                  {{ user.avatar ? 'Change picture' : 'Add a picture' }}
                </Button>
                <Button v-if="user.avatar" size="sm" variant="ghost" :disabled="pictureBusy" @click="removePicture">
                  <template #leading><Trash2 /></template>
                  Remove
                </Button>
              </div>
              <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif" class="sr-only" tabindex="-1" aria-hidden="true" @change="upload" />
            </div>
            <p v-if="pictureError" class="text-sm text-red" role="alert">{{ pictureError }}</p>
          </div>
          <Input v-model="form.name" label="Name" autocomplete="off" :error-text="formErrors.name" />
          <Input v-model="form.username" label="Email" autocapitalize="off" spellcheck="false" autocomplete="off" :error-text="formErrors.username">
            <template #trailing><span class="text-sm text-black/65">@{{ org?.domain }}</span></template>
          </Input>
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="saveStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="saveStatus" loading-text="Saving" @click="save">Save</Button>
      </template>
    </Slideover>

    <RemovePasskeysSlideover v-if="user" v-model:open="removingPasskeys" :org-id="orgId" :user="user" @removed="merge" />

    <Slideover
      v-model:open="confirmMfaOff"
      :title="user ? `Turn off ${user.name}’s MFA?` : 'Turn off MFA?'"
      description="Only do this once you’re sure it’s really them asking, e.g. they’ve lost their phone. Their authenticator app, backup codes, passkeys and security keys all stop working, and until they set MFA up again their password alone signs them in."
    >
      <template #footer="{ close }">
        <Button :disabled="mfaStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="danger" :status="mfaStatus" loading-text="Turning off" @click="turnOffMfa">Turn off MFA</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="resetting"
      :title="user ? `Reset ${user.name}’s password` : 'Reset password'"
      description="They’ll be signed out everywhere, and unlocked if they were locked out. Give them the new password securely."
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="reset">
          <PasswordField v-model="newPassword" v-model:valid="resetValid" label="New password" :organisation-id="orgId" :username="user?.username" :error-text="resetError" />
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
