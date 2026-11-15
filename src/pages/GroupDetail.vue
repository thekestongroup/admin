<script setup lang="ts">
import { Pencil, Plus, Trash2, TriangleAlert, UsersRound } from '@lucide/vue'
import {
  Avatar,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api, type Group, type User } from '../lib/api'

/** One group: its users (add and remove), rename, delete. */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const groupId = route.params.groupId as string
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const group = ref<Group>()
const members = ref<User[]>([])
const everyone = ref<User[]>([])
const error = ref<string>()

async function load() {
  const res = await api.group(orgId, groupId)
  group.value = res.group
  members.value = res.members
}

onMounted(async () => {
  try {
    await load()
    everyone.value = (await api.users(orgId)).filter((u) => !u.support)
  } catch (e) {
    error.value = message(e)
  }
})

const trail = computed(() => [
  { label: 'Groups', to: `/organisations/${orgId}/groups` },
  { label: group.value?.name ?? 'Group' },
])

// Adding a user.
const choice = ref<string>()
const adding = ref(false)
const options = computed(() =>
  everyone.value
    .filter((u) => !members.value.some((m) => m.id === u.id))
    .map((u) => ({ label: `${u.name} (${u.email})`, value: u.id })),
)
async function add() {
  if (!choice.value) return
  adding.value = true
  try {
    await api.addMember(orgId, groupId, choice.value)
    choice.value = undefined
    await load()
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t add them', description: message(e) })
  } finally {
    adding.value = false
  }
}

const removing = ref<string>()
async function remove(u: User) {
  removing.value = u.id
  try {
    await api.removeMember(orgId, groupId, u.id)
    await load()
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t remove them', description: message(e) })
  } finally {
    removing.value = undefined
  }
}

// Renaming.
const renaming = ref(false)
const newName = ref('')
const nameError = ref<string>()
const renameStatus = ref<ButtonStatus>('idle')
function startRename() {
  newName.value = group.value!.name
  nameError.value = undefined
  renameStatus.value = 'idle'
  renaming.value = true
}
async function rename() {
  renameStatus.value = 'loading'
  try {
    await api.renameGroup(orgId, groupId, newName.value)
    await load()
    renaming.value = false
  } catch (e) {
    renameStatus.value = 'idle'
    if (e instanceof ApiError && e.field === 'name') nameError.value = e.message
    else notify({ type: 'error', title: 'Couldn’t rename it', description: message(e) })
  }
}

// Deleting.
const deleting = ref(false)
const deleteStatus = ref<ButtonStatus>('idle')
async function deleteGroup() {
  deleteStatus.value = 'loading'
  try {
    await api.deleteGroup(orgId, groupId)
    notify({ type: 'success', title: `${group.value!.name} deleted`, description: 'Its users keep their accounts.' })
    router.push(`/organisations/${orgId}/groups`)
  } catch (e) {
    deleteStatus.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t delete it', description: message(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the group" :description="error" />
    </Card>
    <div v-else-if="!group" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="group.name">
        <template #actions>
          <Button @click="startRename">
            <template #leading><Pencil /></template>
            Rename
          </Button>
          <Button variant="danger" @click="deleting = true">
            <template #leading><Trash2 /></template>
            Delete
          </Button>
        </template>
      </PageHeader>

      <Card title="Users" :description="`App access set for ${group.name} applies to these users.`">
        <div class="flex flex-col gap-4">
          <div class="flex items-start gap-2">
            <Select v-model="choice" label="Add a user" :options="options" placeholder="Choose a user" class="flex-1" />
            <Button class="mt-6.5 shrink-0" :disabled="!choice" :status="adding ? 'loading' : 'idle'" loading-text="Adding" @click="add">
              <template #leading><Plus /></template>
              Add
            </Button>
          </div>
          <EmptyState
            v-if="!members.length"
            size="sm"
            :icon="UsersRound"
            title="No users in this group"
            class="p-0"
          />
          <ul v-else class="flex flex-col divide-y divide-black/10">
            <li v-for="m in members" :key="m.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar :user="{ name: m.name, avatar: m.avatar }" size="sm" decorative />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-bold">{{ m.name }}</span>
                <span class="truncate text-xs text-black/65">{{ m.email }}</span>
              </span>
              <Button size="sm" variant="ghost" :status="removing === m.id ? 'loading' : 'idle'" @click="remove(m)">
                Remove<span class="sr-only"> {{ m.name }}</span>
              </Button>
            </li>
          </ul>
        </div>
      </Card>
    </template>

    <Slideover v-model:open="renaming" title="Rename group" initial-focus="auto">
      <template #body>
        <form novalidate @submit.prevent="rename">
          <Input v-model="newName" label="Name" :error-text="nameError" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="renameStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="renameStatus" loading-text="Saving" @click="rename">Save</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="deleting"
      :title="group ? `Delete ${group.name}?` : 'Delete group?'"
      description="Its users keep their accounts. App access set for this group stops applying, so they get the default."
    >
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="danger" :status="deleteStatus" loading-text="Deleting" @click="deleteGroup">Delete group</Button>
      </template>
    </Slideover>
  </div>
</template>
