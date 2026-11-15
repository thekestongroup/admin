<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Slideover,
  Spinner,
  Switch,
  type SwitchProps,
  formatDate,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api, loadMe, type Me, type Organisation, type ProfileEditing } from '../lib/api'

/**
 * Organisation settings. Which profile fields people can change themselves
 * in their Keston account (admins can always change them here). Each switch
 * saves as soon as it's flipped, like Keston UI's notification settings.
 */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const { notify } = useNotifications()
const org = ref<Organisation>()
const me = ref<Me>()

const editing = reactive<ProfileEditing>({ name: false, email: false, picture: false })
const loaded = ref(false)
const error = ref<string>()
const state = reactive<Record<keyof ProfileEditing, { status?: SwitchProps['status']; text?: string }>>({
  name: {},
  email: {},
  picture: {},
})

onMounted(async () => {
  try {
    const [settings, o, m] = await Promise.all([api.settings(orgId), api.organisation(orgId), loadMe()])
    Object.assign(editing, settings.profileEditing)
    org.value = o
    me.value = m
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const fields: { key: keyof ProfileEditing; label: string; description: string }[] = [
  { key: 'name', label: 'Name', description: 'How they’re shown in every Keston app.' },
  { key: 'email', label: 'Email', description: 'The part before the @ (the domain stays yours). They sign in with it.' },
  { key: 'picture', label: 'Profile picture', description: 'Shown next to their name in Keston apps.' },
]

// ── Delete the organisation (in 14 days) ────────────────────────────────────

// Its own global admins (not a Keston support account), and never The
// Keston Group's organisation.
const canDelete = computed(
  () => !!org.value && !org.value.isPlatform && me.value?.user.role === 'global_admin' && me.value.organisation.id === orgId && !me.value.user.support,
)
const deleting = ref(false)
const confirmName = ref('')
const confirmError = ref<string>()
const deleteStatus = ref<ButtonStatus>('idle')

function startDelete() {
  confirmName.value = ''
  confirmError.value = undefined
  deleteStatus.value = 'idle'
  deleting.value = true
}

async function scheduleDeletion() {
  deleteStatus.value = 'loading'
  try {
    const res = await api.scheduleDeletion(orgId, confirmName.value)
    deleting.value = false
    notify({
      type: 'success',
      title: `${org.value!.name} will be deleted on ${formatDate(res.deleteAfter)}`,
      description: 'A global admin signing in before then cancels it.',
    })
    router.push(`/organisations/${orgId}`)
  } catch (e) {
    deleteStatus.value = 'idle'
    if (e instanceof ApiError && e.field === 'confirm') confirmError.value = e.message
    else notify({ type: 'error', title: 'Couldn’t schedule the deletion', description: e instanceof Error ? e.message : String(e) })
  }
}

async function save(key: keyof ProfileEditing, on: boolean) {
  state[key] = { status: 'loading', text: 'Saving…' }
  try {
    Object.assign(editing, (await api.saveSettings(orgId, { ...editing, [key]: on })).profileEditing)
    state[key] = { status: 'success', text: 'Saved' }
    setTimeout(() => {
      if (state[key].status === 'success') state[key] = {}
    }, 2000)
  } catch {
    editing[key] = !on
    state[key] = { status: 'error', text: 'Couldn’t save. Try again.' }
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Settings" />
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the settings" :description="error" />
    </Card>
    <div v-else-if="!loaded" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <Card
      v-else
      title="What people can change themselves"
      description="In their Keston account. Anything off says “Your organisation has restricted changing these”. You can always change them here."
    >
      <div class="flex flex-col gap-4">
        <Switch
          v-for="f in fields"
          :key="f.key"
          v-model="editing[f.key]"
          :label="f.label"
          :description="f.description"
          :status="state[f.key].status"
          :status-text="state[f.key].text"
          @update:model-value="save(f.key, $event)"
        />
      </div>
    </Card>

    <Card
      v-if="loaded && canDelete && !org?.deleteAfter"
      title="Delete organisation"
      description="Deletes the organisation and every one of its users after 14 days. If any global admin signs in before then, it’s cancelled."
    >
      <div><Button variant="danger" @click="startDelete">Delete organisation</Button></div>
    </Card>

    <Slideover
      v-model:open="deleting"
      :title="org ? `Delete ${org.name}?` : 'Delete organisation?'"
      description="In 14 days, it and all its users are deleted, and can’t be brought back. Everyone is told, and a global admin signing in before then cancels it."
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="scheduleDeletion">
          <Input v-model="confirmName" :label="`Type ${org?.name} to confirm`" autocomplete="off" :error-text="confirmError" />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="danger" :disabled="confirmName.trim() !== org?.name" :status="deleteStatus" loading-text="Scheduling" @click="scheduleDeletion">
          Delete in 14 days
        </Button>
      </template>
    </Slideover>
  </div>
</template>
