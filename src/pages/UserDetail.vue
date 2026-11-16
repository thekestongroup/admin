<script setup lang="ts">
import { AppWindow, Copy, ImageUp, KeyRound, Pencil, Plus, RectangleEllipsis, ShieldOff, Ticket, Trash2, TriangleAlert, UserRound } from '@lucide/vue'
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
const tabs = computed(() => [
  { value: 'account', label: t('userDetail.tabs.account'), icon: UserRound },
  { value: 'licences', label: t('userDetail.tabs.licences'), icon: AppWindow },
])
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
        { label: t('common.name'), value: user.value.name },
        { label: t('common.email'), value: user.value.email, description: t('userDetail.signInWithThis') },
        { label: t('users.columns.role'), value: user.value.role === 'global_admin' ? t('users.globalAdmin') : user.value.roles.length ? t('userDetail.roleAdmin') : t('users.roleUser') },
        { label: t('userDetail.passwordChanged'), value: formatDate(user.value.passwordChangedAt) },
        { label: t('userDetail.userId'), value: user.value.id },
      ]
    : [],
)
const trail = computed(() => [
  { label: org.value?.name ?? t('nav.organisation'), to: `/organisations/${orgId}` },
  { label: t('users.title'), to: `/organisations/${orgId}/users` },
  { label: user.value?.name ?? t('titles.user') },
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
      description: g.permissions.length ? t('userDetail.gives', g.permissions.length) : undefined,
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
    notify({ type: 'error', title: t('userDetail.couldntAddToGroup'), description: message(e) })
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
    notify({ type: 'error', title: t('userDetail.couldntRemoveFromGroup'), description: message(e) })
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
    notify({ type: 'success', title: t('userDetail.updated') })
  } catch (e) {
    saveStatus.value = 'idle'
    if (e instanceof ApiError && e.field) formErrors[e.field] = e.message
    else notify({ type: 'error', title: t('userDetail.couldntUpdate'), description: message(e) })
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
const resetAuto = ref(false)
/** The password Keston ID made up: shown once, after resetting. */
const resetResult = ref<string>()
const resetValid = ref(false)
const resetError = ref<string>()
const resetStatus = ref<ButtonStatus>('idle')

function startReset() {
  newPassword.value = ''
  resetAuto.value = false
  resetResult.value = undefined
  resetRequireChange.value = true
  resetError.value = undefined
  resetStatus.value = 'idle'
  resetting.value = true
}

async function copyResetPassword(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    notify({ type: 'success', title: t('addUser.passwordCopied') })
  } catch {
    notify({ type: 'error', title: t('addUser.couldntCopy'), description: t('addUser.couldntCopyDescription') })
  }
}

async function reset() {
  resetError.value = resetAuto.value || resetValid.value ? undefined : newPassword.value ? t('password.notYetValid') : t('userDetail.enterNew')
  if (resetError.value) return
  resetStatus.value = 'loading'
  try {
    const done = await api.resetPassword(
      orgId,
      userId,
      resetAuto.value
        ? { generatePassword: true, requirePasswordChange: resetRequireChange.value }
        : { password: newPassword.value, requirePasswordChange: resetRequireChange.value },
    )
    signInCard.value?.reload()
    user.value = await api.user(orgId, userId)
    // A made-up password is shown once; the panel stays open to give it out.
    if (done?.password) resetResult.value = done.password
    else resetting.value = false
    resetStatus.value = 'idle'
    notify({ type: 'success', title: t('userDetail.passwordReset'), description: t('userDetail.passwordResetDescription', { name: user.value.name }) })
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
  if (can('users.reset_password')) out.push({ label: t('users.resetPassword'), icon: KeyRound, onSelect: () => onAccountTab(startReset) })
  if (can('users.mfa') && (u.mfa || u.passkeys > 0))
    out.push({ label: t('userDetail.resetMfa'), icon: ShieldOff, onSelect: () => onAccountTab(() => (confirmMfaOff.value = true)) })
  if (can('users.reset_password'))
    out.push(
      signInCard.value?.passwordChangeRequired
        ? { label: t('signInCard.dontRequire'), icon: RectangleEllipsis, onSelect: () => onAccountTab(() => signInCard.value?.setPasswordChange(false)) }
        : { label: t('signInCard.requireChange'), icon: RectangleEllipsis, onSelect: () => onAccountTab(() => signInCard.value?.setPasswordChange(true)) },
    )
  if (can('users.access_pass') && u.status === 'active')
    out.push({ label: t('signInCard.issue'), icon: Ticket, onSelect: () => onAccountTab(() => signInCard.value?.startIssue()) })
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
      title: t('userDetail.mfaOff'),
      description: t('userDetail.mfaOffDescription', { name: user.value!.name }),
    })
  } catch (e) {
    notify({ type: 'error', title: t('userDetail.couldntTurnOffMfa'), description: message(e) })
  } finally {
    mfaStatus.value = 'idle'
  }
}

const removingPasskeys = ref(false)
const passkeyCount = computed(() => t('userDetail.passkeyCount', user.value?.passkeys ?? 0))

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
      title: status === 'disabled' ? t('userDetail.disabled') : t('userDetail.enabled'),
      description: status === 'disabled' ? t('users.signInBlockedDescription', { name: a.name }) : t('users.signInUnblockedDescription', { name: a.name }),
    })
  } catch (e) {
    notify({ type: 'error', title: t('users.couldntChange'), description: message(e) })
  } finally {
    toggling.value = false
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('userDetail.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!user" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="user.name" :description="user.email" :toolbar="toolbar">
        <template #badge>
          <Badge v-if="user.status === 'disabled'" color="basic">{{ t('users.status.disabled') }}</Badge>
          <Badge v-else-if="user.locked" color="yellow">{{ t('users.status.locked') }}</Badge>
          <Badge v-else color="green">{{ t('users.status.active') }}</Badge>
        </template>
      </PageHeader>

      <Card v-if="user.support">
        <p class="text-sm">
          {{ t('userDetail.supportAccount', { org: org?.name, date: formatDate(user.expiresAt!) }) }}
        </p>
      </Card>

      <Card v-else-if="!user.canChange">
        <p class="text-sm">
          {{ t('userDetail.cantChange', { name: user.name }) }}
        </p>
      </Card>

      <Tabs v-model="tab" :tabs="tabs" :label="t('userDetail.label')">
        <template #account>
          <div class="flex flex-col gap-6">
              <Card :title="t('userDetail.profile')">
                <template v-if="can('users.edit')" #actions>
                  <Button size="sm" @click="startEdit">
                    <template #leading><Pencil /></template>
                    {{ t('userDetail.edit') }}
                  </Button>
                </template>
                <div class="flex flex-col gap-4 @sm:flex-row @sm:items-start @sm:gap-6">
                  <Avatar :user="{ name: user.name, avatar: user.avatar }" size="xl" decorative />
                  <SummaryList :items="details" class="min-w-0 flex-1" />
                </div>
              </Card>

              <Card v-if="can('users.reset_password')" :title="t('password.label')" :description="t('userDetail.passwordDescription')">
                <div><Button @click="startReset">{{ t('users.resetPassword') }}</Button></div>
              </Card>

              <Card v-if="!user.support" :title="t('userDetail.mfaTitle')">
                <template #actions>
                  <Badge v-if="user.mfa" color="green">{{ t('userDetail.on') }}</Badge>
                  <Badge v-else color="yellow">{{ t('userDetail.off') }}</Badge>
                </template>
                <div class="flex flex-col gap-3">
                  <p v-if="user.mfa" class="text-sm text-black/65">
                    {{ user.passkeys ? t('userDetail.mfaWithPasskey', { count: passkeyCount }) : t('userDetail.mfaWithApp') }}
                    {{ t('userDetail.mfaLost') }}
                  </p>
                  <p v-else class="text-sm text-black/65">
                    {{ t('userDetail.mfaPasswordOnly') }}
                  </p>
                  <div v-if="user.mfa && can('users.mfa')" class="flex flex-wrap gap-2">
                    <Button variant="danger" @click="confirmMfaOff = true">{{ t('userDetail.turnOffMfa') }}</Button>
                    <Button v-if="user.passkeys" @click="removingPasskeys = true">{{ t('passkeys.remove') }}</Button>
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
                :title="t('userDetail.groupsAndPermissions')"
                :description="t('userDetail.groupsDescription')"
              >
                <div class="flex flex-col gap-4">
                  <p v-if="user.role === 'global_admin'" class="text-sm">{{ t('userDetail.globalAdminCan') }}</p>
                  <ul v-else-if="user.permissions.length" class="flex flex-wrap gap-2" :aria-label="t('groupDetail.permissions')">
                    <li v-for="p in catalog.filter((c) => user!.permissions.includes(c.id))" :key="p.id">
                      <Badge size="sm" color="primary">{{ p.label }}</Badge>
                    </li>
                  </ul>
                  <p v-else class="text-sm text-black/65">{{ t('userDetail.noPermissions') }}</p>
                  <div class="flex flex-col gap-3">
                    <p class="text-sm font-bold">{{ t('nav.groups') }}</p>
                    <ul v-if="user.groups.length" class="flex flex-col divide-y divide-black/10">
                      <li v-for="g in user.groups" :key="g.id" class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span class="flex min-w-0 flex-1 flex-col">
                          <Link :as="RouterLink" :to="`/organisations/${orgId}/groups/${g.id}`" class="truncate text-sm">{{ g.name }}</Link>
                          <span class="text-xs text-black/65">
                            {{ g.permissions.length ? t('userDetail.gives', g.permissions.length) : t('userDetail.appAccessOnly') }}
                          </span>
                        </span>
                        <Button
                          v-if="mayChange(allGroups.find((x) => x.id === g.id) ?? g)"
                          size="sm"
                          variant="ghost"
                          :status="groupBusy === g.id ? 'loading' : 'idle'"
                          @click="removeFromGroup(g)"
                        >
                          {{ t('common.remove') }}<span class="sr-only"> {{ t('userDetail.fromGroup', { name: g.name }) }}</span>
                        </Button>
                      </li>
                    </ul>
                    <p v-else class="text-sm text-black/65">{{ t('userDetail.noGroups') }}</p>
                    <div v-if="groupOptions.length" class="flex items-start gap-2">
                      <Select v-model="groupChoice" :label="t('userDetail.addToGroup')" :options="groupOptions" :placeholder="t('userDetail.chooseGroup')" class="flex-1" />
                      <Button
                        class="mt-6.5 shrink-0"
                        :disabled="!groupChoice"
                        :status="groupBusy === 'add' ? 'loading' : 'idle'"
                        :loading-text="t('addUser.adding')"
                        @click="addToGroup"
                      >
                        <template #leading><Plus /></template>
                        {{ t('common.add') }}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card v-if="!isMe && can('users.status')" :title="t('userDetail.access')" :description="user.status === 'active' ? t('userDetail.disablingSignsOut') : t('userDetail.cantSignIn')">
                <div>
                  <Button :variant="user.status === 'active' ? 'danger' : 'primary'" :status="toggling ? 'loading' : 'idle'" @click="toggle">
                    {{ user.status === 'active' ? t('userDetail.disableUser') : t('userDetail.enableUser') }}
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

    <Slideover v-model:open="editing" :title="t('userDetail.editUser')" initial-focus="auto">
      <template #body>
        <form v-if="user" class="flex flex-col gap-6" novalidate @submit.prevent="save">
          <div class="flex flex-col gap-3">
            <p class="text-sm font-bold">{{ t('settings.fields.picture') }}</p>
            <div class="flex items-center gap-4">
              <Avatar :user="{ name: user.name, avatar: user.avatar }" size="xl" decorative />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" :status="pictureBusy ? 'loading' : 'idle'" :loading-text="t('userDetail.uploading')" @click="fileInput?.click()">
                  <template #leading><ImageUp /></template>
                  {{ user.avatar ? t('userDetail.changePicture') : t('userDetail.addPicture') }}
                </Button>
                <Button v-if="user.avatar" size="sm" variant="ghost" :disabled="pictureBusy" @click="removePicture">
                  <template #leading><Trash2 /></template>
                  {{ t('common.remove') }}
                </Button>
              </div>
              <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif" class="sr-only" tabindex="-1" aria-hidden="true" @change="upload" />
            </div>
            <p v-if="pictureError" class="text-sm text-red" role="alert">{{ pictureError }}</p>
          </div>
          <Input v-model="form.name" :label="t('common.name')" autocomplete="off" :error-text="formErrors.name" />
          <Input v-model="form.username" :label="t('common.email')" autocapitalize="off" spellcheck="false" autocomplete="off" :error-text="formErrors.username">
            <template #trailing><span class="text-sm text-black/65">@{{ org?.domain }}</span></template>
          </Input>
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="saveStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="saveStatus" :loading-text="t('common.saving')" @click="save">{{ t('common.save') }}</Button>
      </template>
    </Slideover>

    <RemovePasskeysSlideover v-if="user" v-model:open="removingPasskeys" :org-id="orgId" :user="user" @removed="merge" />

    <Slideover
      v-model:open="confirmMfaOff"
      :title="user ? t('userDetail.turnOffNamed', { name: user.name }) : t('userDetail.turnOffQ')"
      :description="t('userDetail.turnOffDescription')"
    >
      <template #footer="{ close }">
        <Button :disabled="mfaStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :status="mfaStatus" :loading-text="t('userDetail.turningOff')" @click="turnOffMfa">{{ t('userDetail.turnOffMfa') }}</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="resetting"
      :title="user ? t('userDetail.resetNamed', { name: user.name }) : t('users.resetPassword')"
      :description="resetResult ? t('userDetail.resetDone') : t('userDetail.resetDescription')"
      initial-focus="auto"
    >
      <template #body>
        <div v-if="resetResult" class="flex flex-col gap-4">
          <SummaryList :items="[{ label: t('password.label'), value: resetResult }]" layout="stacked">
            <template #value="{ item }"><span class="font-mono select-all">{{ item.value }}</span></template>
          </SummaryList>
          <div>
            <Button @click="copyResetPassword(resetResult)">
              <template #leading><Copy /></template>
              {{ t('addUser.copyPassword') }}
            </Button>
          </div>
        </div>
        <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="reset">
          <Checkbox v-model="resetAuto" :label="t('password.auto')" :description="t('userDetail.autoDescription')" />
          <PasswordField v-if="!resetAuto" v-model="newPassword" v-model:valid="resetValid" :label="t('userDetail.newPassword')" :organisation-id="orgId" :username="user?.username" :error-text="resetError" />
          <Checkbox v-model="resetRequireChange" :label="t('userDetail.askChoose')" :description="t('password.requireChangeDescription')" />
          <p v-if="resetAuto && resetError" class="text-sm text-red" role="alert">{{ resetError }}</p>
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template v-if="resetResult" #footer="{ close }">
        <Button variant="primary" @click="close">{{ t('common.done') }}</Button>
      </template>
      <template v-else #footer="{ close }">
        <Button :disabled="resetStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="resetStatus" :loading-text="t('bulk.resetPassword.loading')" @click="reset">{{ t('users.resetPassword') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
