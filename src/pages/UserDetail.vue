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
import { ApiError, api, loadMe, type User, type Organisation } from '../lib/api'

/**
 * One user: their profile (admins can always change it, whatever the
 * organisation lets people change themselves), password and status.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const userId = route.params.userId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const user = ref<User>()
const myId = ref<string>()
const error = ref<string>()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

onMounted(async () => {
  try {
    const [o, a, me] = await Promise.all([api.organisation(orgId), api.user(orgId, userId), loadMe()])
    org.value = o
    user.value = a
    myId.value = me.user.id
  } catch (e) {
    error.value = message(e)
  }
})

const isMe = computed(() => user.value?.id === myId.value)
const details = computed(() =>
  user.value
    ? [
        { label: 'Name', value: user.value.name },
        { label: 'Email', value: user.value.email, description: 'They sign in with this.' },
        { label: 'Role', value: user.value.role === 'global_admin' ? 'Global admin' : 'Member' },
        { label: 'Two-step verification', value: user.value.twoStep ? 'On' : 'Off' },
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

// ── Edit profile ────────────────────────────────────────────────────────────

const editing = ref(false)
const form = reactive({ name: '', username: '', role: 'member' as User['role'] })
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
  const a = user.value!
  Object.assign(form, { name: a.name, username: a.username, role: a.role })
  for (const k of Object.keys(formErrors)) formErrors[k] = undefined
  pictureError.value = undefined
  saveStatus.value = 'idle'
  editing.value = true
}

async function save() {
  const a = user.value!
  const changes: { name?: string; username?: string; role?: User['role'] } = {}
  if (form.name.trim() !== a.name) changes.name = form.name
  if (form.username.trim().toLowerCase() !== a.username) changes.username = form.username
  if (form.role !== a.role) changes.role = form.role
  if (!Object.keys(changes).length) {
    editing.value = false
    return
  }
  saveStatus.value = 'loading'
  try {
    user.value = await api.updateUser(orgId, userId, changes)
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
    user.value = await api.setUserPicture(orgId, userId, file)
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
    user.value = await api.user(orgId, userId)
    resetting.value = false
    notify({ type: 'success', title: 'Password reset', description: `${user.value.name} has been signed out everywhere.` })
  } catch (e) {
    resetStatus.value = 'idle'
    resetError.value = message(e)
  }
}

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
      <PageHeader :title="user.name" :description="user.email">
        <template #badge>
          <Badge v-if="user.status === 'disabled'" color="basic">Disabled</Badge>
          <Badge v-else-if="user.locked" color="yellow">Locked</Badge>
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
          <Avatar :user="{ name: user.name, avatar: user.avatar }" size="xl" decorative />
          <SummaryList :items="details" class="min-w-0 flex-1" />
        </div>
      </Card>

      <Card title="Password" description="A reset signs them out everywhere, and unlocks them if they were locked out.">
        <div><Button @click="startReset">Reset password</Button></div>
      </Card>

      <Card v-if="!isMe" title="Access" :description="user.status === 'active' ? 'Disabling signs them out of Keston and every app.' : 'They can’t sign in.'">
        <div>
          <Button :variant="user.status === 'active' ? 'danger' : 'primary'" :status="toggling ? 'loading' : 'idle'" @click="toggle">
            {{ user.status === 'active' ? 'Disable user' : 'Enable user' }}
          </Button>
        </div>
      </Card>
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
      :title="user ? `Reset ${user.name}’s password` : 'Reset password'"
      description="They’ll be signed out everywhere, and unlocked if they were locked out. Give them the new password securely."
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="reset">
          <PasswordField v-model="newPassword" v-model:valid="resetValid" label="New password" :organisation-id="orgId" :username="user?.username" :error-text="resetError" />
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
