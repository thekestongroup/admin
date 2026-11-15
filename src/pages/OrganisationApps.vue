<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { Card, EmptyState, Link, PageHeader, Select, type SelectProps, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { api, type AppAccess, type AppInfo, type AppMode } from '../lib/api'

/**
 * App access, for everyone (the default, which new users get too) or per
 * group (overriding the default for its users):
 *   - Forced: on, and they can't turn it off
 *   - Enabled: on, and each person can turn it off
 *   - Disabled: off, and they can't use it
 * Keston's own apps are Forced unless set otherwise; other apps, unless set,
 * are up to each person. When someone's groups disagree, Disabled wins, then
 * Forced, then Enabled. Each change saves straight away.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const data = ref<AppAccess>()
const error = ref<string>()
/** 'everyone' (the default) or a group's id. */
const EVERYONE = 'everyone'
const UNSET = 'unset'
const scope = ref(EVERYONE)
const group = computed(() => (scope.value === EVERYONE ? undefined : scope.value))
const saving = reactive<Record<string, { status?: SelectProps['status']; text?: string }>>({})

onMounted(async () => {
  try {
    data.value = await api.apps(orgId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const scopes = computed(() => [
  { label: 'Everyone (default)', value: EVERYONE, description: 'Also what new users get' },
  ...(data.value?.groups ?? []).map((g) => ({ label: g.name, value: g.id, description: g.memberCount === 1 ? '1 user' : `${g.memberCount} users` })),
])

const words: Record<AppMode, string> = { forced: 'Forced', enabled: 'Enabled', disabled: 'Disabled' }
const modeOptions = [
  { label: 'Forced', value: 'forced', description: 'On, and they can’t turn it off' },
  { label: 'Enabled', value: 'enabled', description: 'On, and each person can turn it off' },
  { label: 'Disabled', value: 'disabled', description: 'Off, and they can’t use it' },
]

function defaultMode(app: AppInfo): AppMode | undefined {
  return data.value?.policies.default[app.id] ?? (app.builtin ? 'forced' : undefined)
}

/** The options for an app here: "not set" first (what that means), then the modes. */
function options(app: AppInfo) {
  if (group.value) {
    const d = defaultMode(app)
    return [{ label: `Use the default (${d ? words[d] : 'people choose'})`, value: UNSET }, ...modeOptions]
  }
  return [
    { label: app.builtin ? 'Forced (Keston’s default)' : 'Not set: people choose', value: UNSET },
    ...modeOptions,
  ]
}

function current(app: AppInfo): string {
  const p = data.value!.policies
  return (group.value ? p.groups[group.value]?.[app.id] : p.default[app.id]) ?? UNSET
}

async function change(app: AppInfo, value: string) {
  const mode = value === UNSET ? '' : (value as AppMode)
  const key = app.id
  saving[key] = { status: 'loading', text: 'Saving…' }
  try {
    await api.setAppAccess(orgId, app.id, mode, group.value)
    const p = data.value!.policies
    const target = group.value ? (p.groups[group.value] ??= {}) : p.default
    if (mode) target[app.id] = mode
    else delete target[app.id]
    saving[key] = { status: 'success', text: 'Saved' }
    setTimeout(() => {
      if (saving[key]?.status === 'success') saving[key] = {}
    }, 2000)
  } catch (e) {
    saving[key] = { status: 'error', text: 'Couldn’t save. Try again.' }
    notify({ type: 'error', title: 'Couldn’t save', description: e instanceof Error ? e.message : String(e) })
  }
}

const builtin = computed(() => data.value?.apps.filter((a) => a.builtin) ?? [])
const others = computed(() => data.value?.apps.filter((a) => !a.builtin) ?? [])
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Apps" description="Which apps your users have, shown under Connected apps in their Keston account." />

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the apps" :description="error" />
    </Card>
    <div v-else-if="!data" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Card>
        <div class="flex flex-col gap-2">
          <Select v-model="scope" label="Applies to" :options="scopes" class="max-w-sm" />
          <p class="text-sm text-black/65">
            <template v-if="!group">The default, for everyone not covered by a group’s setting.</template>
            <template v-else>Overrides the default for this group’s users.</template>
            If someone’s groups disagree, Disabled wins, then Forced, then Enabled.
            <Link :as="RouterLink" :to="`/organisations/${orgId}/groups`">Manage groups</Link>
          </p>
        </div>
      </Card>

      <Card v-for="section in [{ title: 'Keston apps', apps: builtin }, { title: 'Other apps', apps: others }]" :key="section.title" :title="section.title">
        <EmptyState v-if="!section.apps.length" size="sm" title="No apps" class="p-0" />
        <div v-else class="flex flex-col gap-4">
          <Select
            v-for="app in section.apps"
            :key="app.id + scope"
            :model-value="current(app)"
            :label="app.name"
            :helper="`By ${app.publisher}`"
            :options="options(app)"
            :status="saving[app.id]?.status"
            :status-text="saving[app.id]?.text"
            @update:model-value="change(app, String($event ?? UNSET))"
          />
        </div>
      </Card>
    </template>
  </div>
</template>
