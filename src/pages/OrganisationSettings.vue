<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  type InputProps,
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
import LicenceAllocationsCard from '../components/LicenceAllocationsCard.vue'
import { checkFormula, suggestUsername } from '../lib/usernames'
import { ApiError, api, loadMe, type Me, type Organisation, type ProfileEditing } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
    usernameFormat.value = savedFormat.value = settings.usernameFormat
    org.value = o
    me.value = m
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const fields = computed<{ key: keyof ProfileEditing; label: string; description: string }[]>(() => [
  { key: 'name', label: t('settings.fields.name'), description: t('settings.fields.nameDescription') },
  { key: 'email', label: t('common.email'), description: t('settings.fields.emailDescription') },
  { key: 'picture', label: t('settings.fields.picture'), description: t('settings.fields.pictureDescription') },
])

// ── Username format ─────────────────────────────────────────────────────────

const usernameFormat = ref('{first}.{last}')
const savedFormat = ref('{first}.{last}')
const formatError = computed(() => checkFormula(usernameFormat.value))
const formatState = ref<{ status?: InputProps['status']; text?: string }>({})
const examples = [
  ['John', 'Doe'],
  ['Zoë', 'O’Brien'],
]
const preview = computed(() =>
  formatError.value ? '' : examples.map(([f, l]) => `${f} ${l} → ${suggestUsername(usernameFormat.value, f!, l!)}@${org.value?.domain ?? 'example.com'}`).join(', '),
)
let formatTimer: ReturnType<typeof setTimeout> | undefined
function editFormat(value: string) {
  usernameFormat.value = value
  formatState.value = {}
  clearTimeout(formatTimer)
  if (formatError.value || value.trim() === savedFormat.value) return
  formatTimer = setTimeout(saveFormat, 800)
}
async function saveFormat() {
  formatState.value = { status: 'loading', text: t('settings.saving') }
  try {
    savedFormat.value = (await api.saveUsernameFormat(orgId, usernameFormat.value.trim())).usernameFormat
    formatState.value = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (formatState.value.status === 'success') formatState.value = {}
    }, 2000)
  } catch (e) {
    formatState.value = { status: 'error', text: e instanceof Error ? e.message : t('settings.couldntSave') }
  }
}

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
      title: t('settings.deleteScheduled', { name: org.value!.name, date: formatDate(res.deleteAfter) }),
      description: t('settings.deleteScheduledDescription'),
    })
    router.push(`/organisations/${orgId}`)
  } catch (e) {
    deleteStatus.value = 'idle'
    if (e instanceof ApiError && e.field === 'confirm') confirmError.value = e.message
    else notify({ type: 'error', title: t('settings.couldntSchedule'), description: e instanceof Error ? e.message : String(e) })
  }
}

async function save(key: keyof ProfileEditing, on: boolean) {
  state[key] = { status: 'loading', text: t('settings.saving') }
  try {
    Object.assign(editing, (await api.saveSettings(orgId, { ...editing, [key]: on })).profileEditing)
    state[key] = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (state[key].status === 'success') state[key] = {}
    }, 2000)
  } catch {
    editing[key] = !on
    state[key] = { status: 'error', text: t('settings.couldntSave') }
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('settings.title')" />
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('settings.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!loaded" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <Card
      v-else
      :title="t('settings.profile.title')"
      :description="t('settings.profile.description')"
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

    <LicenceAllocationsCard v-if="loaded && me?.platformAdmin" :org-id="orgId" />

    <Card
      v-if="loaded"
      :title="t('settings.newUsers.title')"
      :description="t('settings.newUsers.description')"
    >
      <div class="flex flex-col gap-2">
        <Input
          :model-value="usernameFormat"
          :label="t('settings.newUsers.format')"
          :helper="t('settings.newUsers.formatHelper')"
          autocapitalize="off"
          spellcheck="false"
          autocomplete="off"
          :error-text="formatError"
          :status="formatState.status"
          :status-text="formatState.text || (preview ? t('settings.newUsers.example', { example: preview }) : undefined)"
          class="max-w-xl"
          @update:model-value="editFormat(String($event ?? ''))"
        />
      </div>
    </Card>

    <Card
      v-if="loaded && canDelete && !org?.deleteAfter"
      :title="t('settings.delete.title')"
      :description="t('settings.delete.description')"
    >
      <div><Button variant="danger" @click="startDelete">{{ t('settings.delete.title') }}</Button></div>
    </Card>

    <Slideover
      v-model:open="deleting"
      :title="org ? t('settings.delete.askNamed', { name: org.name }) : t('settings.delete.ask')"
      :description="t('settings.delete.askDescription')"
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="scheduleDeletion">
          <Input v-model="confirmName" :label="t('settings.delete.typeName')" :helper="t('settings.delete.typeNameHelper', { name: org?.name })" autocomplete="off" :error-text="confirmError" />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :disabled="confirmName.trim() !== org?.name" :status="deleteStatus" :loading-text="t('settings.delete.scheduling')" @click="scheduleDeletion">
          {{ t('settings.delete.confirm') }}
        </Button>
      </template>
    </Slideover>
  </div>
</template>
