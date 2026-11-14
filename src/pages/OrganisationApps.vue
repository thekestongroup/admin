<script setup lang="ts">
import { AppWindow, Plus, TriangleAlert } from '@lucide/vue'
import {
  Avatar,
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  PageHeader,
  RadioGroup,
  Select,
  Slideover,
  Spinner,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, type OrganisationApps } from '../lib/api'

/**
 * The apps everyone at the organisation sees under Connected apps in Keston
 * ID: Keston's own (always there), and apps the organisation adds, either
 * enabled for everyone or optional (each person can remove it).
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const apps = ref<OrganisationApps>()
const error = ref<string>()
const busy = ref<string>()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function load() {
  apps.value = await api.apps(orgId)
}
onMounted(async () => {
  try {
    await load()
  } catch (e) {
    error.value = message(e)
  }
})

const modes = [
  { label: 'Enabled for everyone', value: 'enabled', description: 'Shown as “Enabled by your organisation”. People can’t remove it.' },
  { label: 'Optional', value: 'optional', description: 'Shown as “Added by your organisation”. Each person can remove it.' },
]

// Adding an app.
const adding = ref(false)
const choice = ref<string>()
const mode = ref<'enabled' | 'optional'>('optional')
const addStatus = ref<ButtonStatus>('idle')
const options = computed(() => (apps.value?.available ?? []).map((a) => ({ label: `${a.name} (${a.publisher})`, value: a.id })))

function startAdding() {
  choice.value = undefined
  mode.value = 'optional'
  addStatus.value = 'idle'
  adding.value = true
}

async function add() {
  if (!choice.value) return
  addStatus.value = 'loading'
  try {
    await api.setApp(orgId, choice.value, mode.value)
    await load()
    adding.value = false
    notify({ type: 'success', title: 'App added' })
  } catch (e) {
    addStatus.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t add the app', description: message(e) })
  }
}

async function change(appId: string, newMode: 'enabled' | 'optional') {
  busy.value = appId
  try {
    await api.setApp(orgId, appId, newMode)
    await load()
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change it', description: message(e) })
  } finally {
    busy.value = undefined
  }
}

async function remove(appId: string, name: string) {
  busy.value = appId
  try {
    await api.removeApp(orgId, appId)
    await load()
    notify({ type: 'success', title: `${name} removed`, description: 'It won’t be shown to your people any more.' })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t remove it', description: message(e) })
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Apps" description="What your people see under Connected apps in their Keston account.">
      <template #actions>
        <Button variant="primary" :disabled="!apps?.available.length" @click="startAdding">
          <template #leading><Plus /></template>
          Add an app
        </Button>
      </template>
    </PageHeader>

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the apps" :description="error" />
    </Card>
    <div v-else-if="!apps" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Card title="Keston apps" description="Every organisation has these. Shown as “Enabled by your organisation”.">
        <ul class="flex flex-col divide-y divide-black/10">
          <li v-for="app in apps.builtin" :key="app.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Avatar :user="{ name: app.name }" size="sm" decorative />
            <span class="flex-1 text-sm font-bold">{{ app.name }}</span>
            <Badge size="sm" color="blue">Always on</Badge>
          </li>
        </ul>
      </Card>

      <Card title="Your organisation’s apps">
        <EmptyState
          v-if="!apps.organisation.length"
          size="sm"
          :icon="AppWindow"
          title="No apps added"
          description="Add apps your people use, so they find them in their Keston account."
          class="p-0"
        />
        <ul v-else class="flex flex-col divide-y divide-black/10">
          <li v-for="oa in apps.organisation" :key="oa.app.id" class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Avatar :user="{ name: oa.app.name }" size="sm" decorative />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm font-bold">{{ oa.app.name }}</span>
              <span class="text-xs text-black/65">By {{ oa.app.publisher }}</span>
            </span>
            <Button
              size="sm"
              :status="busy === oa.app.id ? 'loading' : 'idle'"
              @click="change(oa.app.id, oa.mode === 'enabled' ? 'optional' : 'enabled')"
            >
              {{ oa.mode === 'enabled' ? 'Make optional' : 'Enable for everyone' }}
            </Button>
            <Badge size="sm" :color="oa.mode === 'enabled' ? 'blue' : 'basic'">
              {{ oa.mode === 'enabled' ? 'Enabled for everyone' : 'Optional' }}
            </Badge>
            <Button size="sm" variant="ghost" :disabled="busy === oa.app.id" @click="remove(oa.app.id, oa.app.name)">
              Remove<span class="sr-only"> {{ oa.app.name }}</span>
            </Button>
          </li>
        </ul>
      </Card>
    </template>

    <Slideover v-model:open="adding" title="Add an app" description="It’ll show under Connected apps for everyone here." initial-focus="auto">
      <template #body>
        <div class="flex flex-col gap-6">
          <Select v-model="choice" label="App" :options="options" placeholder="Choose an app" />
          <RadioGroup v-model="mode" label="For everyone, or optional?" :options="modes" />
        </div>
      </template>
      <template #footer="{ close }">
        <Button :disabled="addStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :disabled="!choice" :status="addStatus" loading-text="Adding" @click="add">Add app</Button>
      </template>
    </Slideover>
  </div>
</template>
