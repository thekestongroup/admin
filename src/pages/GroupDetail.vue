<script setup lang="ts">
import { Pencil, Plus, Trash2, TriangleAlert, UsersRound } from '@lucide/vue'
import {
  Avatar,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  CheckboxGroup,
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
import { ApiError, api, type Group, type LicenceIssue, type Permission, type PermissionId, type Product, type User } from '../lib/api'
import { licenceOption } from '../lib/licences'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** One group: its users (add and remove), its permissions in Keston Admin, rename, delete. */
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
const catalog = ref<Permission[]>([])
/** What you can do here. */
const mine = ref<PermissionId[]>([])
const has = (p: PermissionId) => mine.value.includes(p)

async function load() {
  const res = await api.group(orgId, groupId)
  group.value = res.group
  members.value = res.members
  chosen.value = [...res.group.permissions]
}

onMounted(async () => {
  try {
    const [, users, perms, o] = await Promise.all([load(), api.users(orgId), api.permissions(), api.organisation(orgId)])
    loadLicences()
    everyone.value = users.filter((u) => !u.support)
    catalog.value = perms
    mine.value = o.permissions ?? []
  } catch (e) {
    error.value = message(e)
  }
})

/** You have every permission this group gives (so you can change it). */
const coversGroup = computed(() => !!group.value && group.value.permissions.every(has))
/** Who's in it: Manage groups (or Give permissions); for a group that gives
 *  permissions, Give permissions and every one of them. */
const canChangeMembers = computed(() =>
  group.value?.permissions.length ? has('permissions.assign') && coversGroup.value : has('groups.manage') || has('permissions.assign'),
)
const canAssign = computed(() => has('permissions.assign') && coversGroup.value)

// Licences: what every member gets. Members past the seats are listed.
const products = ref<Product[]>([])
const chosenLicences = ref<string[]>([])
const given = ref<string[]>([])
const issues = ref<LicenceIssue[]>([])
const licenceStatus = ref<ButtonStatus>('idle')
const licenceError = ref<string>()
const canLicence = computed(() => has('users.licences'))
function applyLicences(l: { products: string[]; issues: LicenceIssue[] }) {
  given.value = l.products
  chosenLicences.value = [...l.products]
  issues.value = l.issues
}
async function loadLicences() {
  try {
    const [list, l] = await Promise.all([api.products(orgId), api.groupLicences(orgId, groupId)])
    products.value = list
    applyLicences(l)
  } catch (e) {
    licenceError.value = message(e)
  }
}
const licencesChanged = computed(() => chosenLicences.value.toSorted().join() !== given.value.toSorted().join())
const productName = (id: string) => products.value.find((p) => p.id === id)?.name ?? id
async function saveLicences() {
  licenceStatus.value = 'loading'
  try {
    applyLicences(await api.setGroupLicences(orgId, groupId, chosenLicences.value))
    products.value = await api.products(orgId).catch(() => products.value)
    licenceStatus.value = 'success'
  } catch (e) {
    licenceStatus.value = 'idle'
    notify({ type: 'error', title: t('licences.group.couldntSave'), description: message(e) })
  }
}

// Permissions.
const chosen = ref<PermissionId[]>([])
const permStatus = ref<ButtonStatus>('idle')
const permissionOptions = computed(() =>
  catalog.value.map((p) => ({ label: p.label, value: p.id, description: p.description, disabled: !canAssign.value || !has(p.id) })),
)
const changed = computed(() => chosen.value.toSorted().join() !== (group.value?.permissions ?? []).toSorted().join())
async function savePermissions() {
  permStatus.value = 'loading'
  try {
    group.value = await api.setGroupPermissions(orgId, groupId, chosen.value)
    chosen.value = [...group.value.permissions]
    permStatus.value = 'success'
  } catch (e) {
    permStatus.value = 'idle'
    notify({ type: 'error', title: t('groupDetail.couldntSavePermissions'), description: message(e) })
  }
}

const trail = computed(() => [
  { label: t('groups.title'), to: `/organisations/${orgId}/groups` },
  { label: group.value?.name ?? t('titles.group') },
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
    loadLicences()
  } catch (e) {
    notify({ type: 'error', title: t('groupDetail.couldntAdd'), description: message(e) })
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
    loadLicences()
  } catch (e) {
    notify({ type: 'error', title: t('groupDetail.couldntRemove'), description: message(e) })
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
    else notify({ type: 'error', title: t('groupDetail.couldntRename'), description: message(e) })
  }
}

// Deleting.
const deleting = ref(false)
const deleteStatus = ref<ButtonStatus>('idle')
async function deleteGroup() {
  deleteStatus.value = 'loading'
  try {
    await api.deleteGroup(orgId, groupId)
    notify({ type: 'success', title: t('groupDetail.deleted', { name: group.value!.name }), description: t('groupDetail.deletedDescription') })
    router.push(`/organisations/${orgId}/groups`)
  } catch (e) {
    deleteStatus.value = 'idle'
    notify({ type: 'error', title: t('groupDetail.couldntDelete'), description: message(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('groupDetail.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!group" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="group.name">
        <template v-if="has('groups.manage')" #actions>
          <Button @click="startRename">
            <template #leading><Pencil /></template>
            {{ t('groupDetail.rename') }}
          </Button>
          <Button v-if="canChangeMembers" variant="danger" @click="deleting = true">
            <template #leading><Trash2 /></template>
            {{ t('common.delete') }}
          </Button>
        </template>
      </PageHeader>

      <Card :title="t('groups.columns.users')" :description="t('groupDetail.usersDescription', { name: group.name })">
        <div class="flex flex-col gap-4">
          <div v-if="canChangeMembers" class="flex items-start gap-2">
            <Select v-model="choice" :label="t('groupDetail.addUser')" :options="options" :placeholder="t('groupDetail.chooseUser')" class="flex-1" />
            <Button class="mt-6.5 shrink-0" :disabled="!choice" :status="adding ? 'loading' : 'idle'" :loading-text="t('addUser.adding')" @click="add">
              <template #leading><Plus /></template>
              {{ t('common.add') }}
            </Button>
          </div>
          <EmptyState
            v-if="!members.length"
            size="sm"
            :icon="UsersRound"
            :title="t('groupDetail.noUsers')"
            class="p-0"
          />
          <ul v-else class="flex flex-col divide-y divide-black/10">
            <li v-for="m in members" :key="m.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar :user="{ name: m.name, avatar: m.avatar }" size="sm" decorative />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-bold">{{ m.name }}</span>
                <span class="truncate text-xs text-black/65">{{ m.email }}</span>
              </span>
              <Button v-if="canChangeMembers" size="sm" variant="ghost" :status="removing === m.id ? 'loading' : 'idle'" @click="remove(m)">
                {{ t('common.remove') }}<span class="sr-only"> {{ m.name }}</span>
              </Button>
            </li>
          </ul>
        </div>
      </Card>

      <Card :title="t('licences.group.title')" :description="t('licences.group.description', { name: group.name })">
        <div class="flex flex-col gap-4">
          <EmptyState v-if="licenceError" size="sm" :title="t('licences.group.couldntLoad')" :description="licenceError" class="p-0" />
          <template v-else>
            <div v-if="issues.length" class="flex flex-col gap-2 rounded-lg border border-red p-3" role="alert">
              <span class="text-sm font-bold text-red">{{ t('licences.group.noSeatsTitle') }}</span>
              <span class="text-sm">{{ t('licences.group.noSeatsDescription', { products: [...new Set(issues.flatMap((i) => i.products.map(productName)))].join(', ') }) }}</span>
              <ul class="list-disc pl-5 text-sm">
                <li v-for="i in issues" :key="i.userId">
                  <RouterLink :to="`/organisations/${orgId}/users/${i.userId}?tab=licences`" class="underline">
                    {{ t('licences.group.noSeatsItem', { name: i.name, products: i.products.map(productName).join(', ') }) }}
                  </RouterLink>
                </li>
              </ul>
            </div>
            <CheckboxGroup
              v-model="chosenLicences"
              :label="t('licences.group.title')"
              hide-label
              :options="products.map((p) => ({ ...licenceOption(t, p, true), disabled: !canLicence }))"
            />
          </template>
        </div>
        <template v-if="canLicence && !licenceError" #footer>
          <Button
            variant="primary"
            v-model:status="licenceStatus"
            :disabled="!licencesChanged && licenceStatus === 'idle'"
            :loading-text="t('common.saving')"
            :success-text="t('common.saved')"
            @click="saveLicences"
          >
            {{ t('licences.group.save') }}
          </Button>
        </template>
      </Card>

      <Card
        :title="t('groupDetail.permissions')"
        :description="t('groupDetail.permissionsDescription', { name: group.name })"
      >
        <div class="flex flex-col gap-4">
          <p v-if="!has('permissions.assign')" class="text-sm text-black/65">
            {{ t('groupDetail.needGive') }}
          </p>
          <p v-else-if="!coversGroup" class="text-sm text-black/65">
            {{ t('groupDetail.cantCover') }}
          </p>
          <CheckboxGroup v-model="chosen" :label="t('groupDetail.permissions')" hide-label :options="permissionOptions" />
        </div>
        <template v-if="canAssign" #footer>
          <Button
            variant="primary"
            v-model:status="permStatus"
            :disabled="!changed && permStatus === 'idle'"
            :loading-text="t('common.saving')"
            :success-text="t('common.saved')"
            @click="savePermissions"
          >
            {{ t('groupDetail.savePermissions') }}
          </Button>
        </template>
      </Card>
    </template>

    <Slideover v-model:open="renaming" :title="t('groupDetail.renameGroup')" initial-focus="auto">
      <template #body>
        <form novalidate @submit.prevent="rename">
          <Input v-model="newName" :label="t('common.name')" :error-text="nameError" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="renameStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="renameStatus" :loading-text="t('common.saving')" @click="rename">{{ t('common.save') }}</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="deleting"
      :title="group ? t('groupDetail.deleteTitle', { name: group.name }) : t('groupDetail.deleteGroupQ')"
      :description="t('groupDetail.deleteDescription')"
    >
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :status="deleteStatus" :loading-text="t('common.deleting')" @click="deleteGroup">{{ t('groupDetail.deleteGroup') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
