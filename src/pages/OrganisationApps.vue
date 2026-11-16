<script setup lang="ts">
import { Plus, TriangleAlert } from '@lucide/vue'
import { Button, Card, EmptyState, Link, PageHeader, Select, type SelectProps, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { api, type AppAccess, type AppInfo, type AppMode } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  { label: t('apps.everyone'), value: EVERYONE, description: t('apps.everyoneDescription') },
  ...(data.value?.groups ?? []).map((g) => ({ label: g.name, value: g.id, description: t('bulk.groups.members', g.memberCount) })),
])

const words = computed<Record<AppMode, string>>(() => ({ forced: t('apps.mode.forced'), enabled: t('apps.mode.enabled'), disabled: t('apps.mode.disabled') }))
const modeOptions = computed(() => [
  { label: t('apps.mode.forced'), value: 'forced', description: t('apps.mode.forcedDescription') },
  { label: t('apps.mode.enabled'), value: 'enabled', description: t('apps.mode.enabledDescription') },
  { label: t('apps.mode.disabled'), value: 'disabled', description: t('apps.mode.disabledDescription') },
])

function defaultMode(app: AppInfo): AppMode | undefined {
  return data.value?.policies.default[app.id] ?? (app.builtin ? 'forced' : undefined)
}

/** The options for an app here: "not set" first (what that means), then the modes. */
function options(app: AppInfo) {
  if (group.value) {
    const d = defaultMode(app)
    return [{ label: t('apps.useDefault', { mode: d ? words.value[d] : t('apps.peopleChoose') }), value: UNSET }, ...modeOptions.value]
  }
  return [
    { label: app.builtin ? t('apps.kestonDefault') : t('apps.notSet'), value: UNSET },
    ...modeOptions.value,
  ]
}

function current(app: AppInfo): string {
  const p = data.value!.policies
  return (group.value ? p.groups[group.value]?.[app.id] : p.default[app.id]) ?? UNSET
}

async function change(app: AppInfo, value: string) {
  const mode = value === UNSET ? '' : (value as AppMode)
  const key = app.id
  saving[key] = { status: 'loading', text: t('settings.saving') }
  try {
    await api.setAppAccess(orgId, app.id, mode, group.value)
    const p = data.value!.policies
    const target = group.value ? (p.groups[group.value] ??= {}) : p.default
    if (mode) target[app.id] = mode
    else delete target[app.id]
    saving[key] = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (saving[key]?.status === 'success') saving[key] = {}
    }, 2000)
  } catch (e) {
    saving[key] = { status: 'error', text: t('settings.couldntSave') }
    notify({ type: 'error', title: t('mfa.everyoneElse.couldntSaveTitle'), description: e instanceof Error ? e.message : String(e) })
  }
}

const builtin = computed(() => data.value?.apps.filter((a) => a.builtin) ?? [])
const own = computed(() => data.value?.apps.filter((a) => a.own) ?? [])
const others = computed(() => data.value?.apps.filter((a) => !a.builtin && !a.own) ?? [])
const sections = computed(() => [
  { key: 'builtin', title: t('apps.sections.keston'), apps: builtin.value },
  { key: 'own', title: t('apps.sections.own'), apps: own.value },
  { key: 'other', title: t('apps.sections.other'), apps: others.value },
])
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('nav.apps')" :description="t('apps.description')">
      <template #actions>
        <Button :as="RouterLink" :to="`/organisations/${orgId}/apps/new`">
          <template #leading><Plus /></template>
          {{ t('apps.addApp') }}
        </Button>
      </template>
    </PageHeader>

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('apps.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!data" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Card>
        <div class="flex flex-col gap-2">
          <Select v-model="scope" :label="t('apps.appliesTo')" :options="scopes" class="max-w-sm" />
          <p class="text-sm text-black/65">
            {{ group ? t('apps.scopeGroup') : t('apps.scopeDefault') }}
            {{ t('apps.disagree') }}
            <Link :as="RouterLink" :to="`/organisations/${orgId}/groups`">{{ t('apps.manageGroups') }}</Link>
          </p>
        </div>
      </Card>

      <Card v-for="section in sections" :key="section.key" :title="section.title">
        <EmptyState v-if="!section.apps.length" size="sm" :title="t('userApps.none')" class="p-0" />
        <div v-else class="flex flex-col gap-4">
          <div v-for="app in section.apps" :key="app.id + scope" class="flex flex-col gap-1">
          <Select
            :model-value="current(app)"
            :label="app.name"
            :helper="app.own ? t('apps.addedByOrg') : t('licences.by', { publisher: app.publisher })"
            :options="options(app)"
            :status="saving[app.id]?.status"
            :status-text="saving[app.id]?.text"
            @update:model-value="change(app, String($event ?? UNSET))"
          />
            <Link v-if="app.own" :as="RouterLink" :to="`/organisations/${orgId}/apps/own/${app.id}`" class="self-start text-sm">
              {{ t('apps.protocolSettings', { protocol: app.protocol === 'saml' ? 'SAML' : 'OpenID Connect' }) }}<span class="sr-only"> {{ t('apps.forApp', { name: app.name }) }}</span>
            </Link>
          </div>
        </div>
      </Card>
    </template>
  </div>
</template>
