<script setup lang="ts">
import { ImageUp, Pencil, Trash2, TriangleAlert } from '@lucide/vue'
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  PageHeader,
  RadioGroup,
  Slideover,
  Spinner,
  SummaryList,
  formatDate,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PasswordField from '../components/PasswordField.vue'
import { ApiError, api, loadMe, type Account, type Organisation } from '../lib/api'

/**
 * One account: its profile (admins can always change it, whatever the
 * organisation lets people change themselves), password and status.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const userId = route.params.userId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const account = ref<Account>()
const myId = ref<string>()
const error = ref<string>()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

onMounted(async () => {
  try {
    const [o, a, me] = await Promise.all([api.organisation(orgId), api.user(orgId, userId), loadMe()])
    org.value = o
    account.value = a
    myId.value = me.user.id
  } catch (e) {
    error.value = message(e)
  }
})

const isMe = computed(() => account.value?.id === myId.value)
const details = computed(() =>
  account.value
    ? [
        { label: 'Name', value: account.value.name },
        { label: 'Email', value: account.value.email, description: 'They sign in with this.' },
        { label: 'Role', value: account.value.role === 'global_admin' ? 'Global admin' : 'Member' },
        { label: 'Two-step verification', value: account.value.twoStep ? 'On' : 'Off' },
        { label: 'Password changed', value: formatDate(account.value.passwordChangedAt) },
        { label: 'Account ID', value: account.value.id },
      ]
    : [],
)
const trail = computed(() => [
  { label: org.value?.name ?? 'Organisation', to: `/organisations/${orgId}` },
  { label: 'Accounts', to: `/organisations/${orgId}/accounts` },
  { label: account.value?.name ?? 'Account' },
])

// ── Edit profile ────────────────────────────────────────────────────────────

const editing = ref(false)
const form = reactive({ name: '', username: '', role: 'member' as Account['role'] })
const formErrors = reactive<Record<string, string | undefined>>({})
const saveStatus = ref<ButtonStatus>('idle')
const pictureBusy = ref(false)
const pictureError = ref<string>()
const fileInput = ref<HTMLInputElement>()
const roles = [
  { label: 'Member', value: 'member', description: 'Signs in to Keston apps.' },
  { label: 'Global admin', value: 'global_admin', description: 'Also manages this organisation here.' },
]

function startEdit() {
  const a = account.value!
  Object.assign(form, { name: a.name, username: a.username, role: a.role })
  for (const k of Object.keys(formErrors)) formErrors[k] = undefined
  pictureError.value = undefined
  saveStatus.value = 'idle'
  editing.value = true
}

async function save() {
  const a = account.value!
  const changes: { name?: string; username?: string; role?: Account['role'] } = {}
  if (form.name.trim() !== a.name) changes.name = form.name
  if (form.username.trim().toLowerCase() !== a.username) changes.username = form.username
  if (form.role !== a.role) changes.role = form.role
  if (!Object.keys(changes).length) {
    editing.value = false
    return
  }
  saveStatus.value = 'loading'
  try {
    account.value = await api.updateUser(orgId, userId, changes)
    editing.value = false
    notify({ type: 'success', title: 'Account updated' })
  } catch (e) {
    saveStatus.value = 'idle'
    if (e instanceof ApiError && e.field) formErrors[e.field] = e.message
    else notify({ type: 'error', title: 'Couldn’t update the account', description: message(e) })
  }
}

async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  pictureBusy.value = true
  pictureError.value = undefined
  try {
    account.value = await api.setUserPicture(orgId, userId, file)
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
    account.value = { ...account.value!, avatar: undefined }
  } catch (e) {
    pictureError.value = message(e)
  } finally {
    pictureBusy.value = false
  }
}

// ── Reset password ──────────────────────────────────────────────────────────

const resetting = ref(false)
const newPassword = ref('')
const resetValid = ref(false)
const resetError = ref<string>()
const resetStatus = ref<ButtonStatus>('idle')

function startReset() {
  newPassword.value = ''
  resetError.value = undefined
  resetStatus.value = 'idle'
  resetting.value = true
}

async function reset() {
  resetError.value = resetValid.value ? undefined : newPassword.value ? 'The password doesn’t meet every rule yet' : 'Enter a new password'
  if (resetError.value) return
  resetStatus.value = 'loading'
  try {
    await api.resetPassword(orgId, userId, newPassword.value)
    account.value = await api.user(orgId, userId)
    resetting.value = false
    notify({ type: 'success', title: 'Password reset', description: `${account.value.name} has been signed out everywhere.` })
  } catch (e) {
    resetStatus.value = 'idle'
    resetError.value = message(e)
  }
}

// ── Disable / enable ────────────────────────────────────────────────────────

const toggling = ref(false)
async function toggle() {
  const a = account.value!
  const status = a.status === 'active' ? 'disabled' : 'active'
  toggling.value = true
  try {
    await api.setStatus(orgId, userId, status)
    account.value = await api.user(orgId, userId)
    notify({
      type: 'success',
      title: status === 'disabled' ? 'Account disabled' : 'Account enabled',
      description: status === 'disabled' ? `${a.name} has been signed out and can’t sign in.` : `${a.name} can sign in again.`,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change the account', description: message(e) })
  } finally {
    toggling.value = false
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the account" :description="error" />
    </Card>
    <div v-else-if="!account" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="account.name" :description="account.email">
        <template #badge>
          <Badge v-if="account.status === 'disabled'" color="basic">Disabled</Badge>
          <Badge v-else-if="account.locked" color="yellow">Locked</Badge>
          <Badge v-else color="green">Active</Badge>
        </template>
      </PageHeader>

      <Card title="Profile">
        <template #actions>
          <Button size="sm" @click="startEdit">
            <template #leading><Pencil /></template>
            Edit
          </Button>
        </template>
        <div class="flex flex-col gap-4 @sm:flex-row @sm:items-start @sm:gap-6">
          <Avatar :user="{ name: account.name, avatar: account.avatar }" size="xl" decorative />
          <SummaryList :items="details" class="min-w-0 flex-1" />
        </div>
      </Card>

      <Card title="Password" description="A reset signs them out everywhere, and unlocks the account.">
        <div><Button @click="startReset">Reset password</Button></div>
      </Card>

      <Card v-if="!isMe" title="Access" :description="account.status === 'active' ? 'Disabling signs them out of Keston and every app.' : 'They can’t sign in.'">
        <div>
          <Button :variant="account.status === 'active' ? 'danger' : 'primary'" :status="toggling ? 'loading' : 'idle'" @click="toggle">
            {{ account.status === 'active' ? 'Disable account' : 'Enable account' }}
          </Button>
        </div>
      </Card>
    </template>

    <Slideover v-model:open="editing" title="Edit account" initial-focus="auto">
      <template #body>
        <form v-if="account" class="flex flex-col gap-6" novalidate @submit.prevent="save">
          <div class="flex flex-col gap-3">
            <p class="text-sm font-bold">Profile picture</p>
            <div class="flex items-center gap-4">
              <Avatar :user="{ name: account.name, avatar: account.avatar }" size="xl" decorative />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" :status="pictureBusy ? 'loading' : 'idle'" loading-text="Uploading" @click="fileInput?.click()">
                  <template #leading><ImageUp /></template>
                  {{ account.avatar ? 'Change picture' : 'Add a picture' }}
                </Button>
                <Button v-if="account.avatar" size="sm" variant="ghost" :disabled="pictureBusy" @click="removePicture">
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
          <RadioGroup v-model="form.role" label="Role" :options="roles" :error-text="formErrors.role" />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="saveStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="saveStatus" loading-text="Saving" @click="save">Save</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="resetting"
      :title="account ? `Reset ${account.name}’s password` : 'Reset password'"
      description="They’ll be signed out everywhere, and their account unlocked. Give them the new password securely."
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="reset">
          <PasswordField v-model="newPassword" v-model:valid="resetValid" label="New password" :organisation-id="orgId" :username="account?.username" :error-text="resetError" />
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
