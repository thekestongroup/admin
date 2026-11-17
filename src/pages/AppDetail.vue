<script setup lang="ts">
import { AppWindow, Copy, Download, KeyRound, Settings, ShieldCheck, Trash2, TriangleAlert, Undo2 } from '@lucide/vue'
import {
  Badge,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  PageHeader,
  Select,
  type SelectProps,
  Slideover,
  Spinner,
  SummaryList,
  Tabs,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppRulesCard from '../components/AppRulesCard.vue'
import KestonAppForm from '../components/KestonAppForm.vue'
import OwnAppForm from '../components/OwnAppForm.vue'
import {
  type AppInfo,
  type AppMode,
  type AppRuleOptions,
  api,
  type KestonApp,
  type KestonAppChanges,
  kestonApps,
  type OwnApp,
  type OwnAppChanges,
  ownApps,
} from '../lib/api'

const { t } = useI18n()

/**
 * One app, with tabs:
 *   - Overview: who publishes it, what it's for and the organisation's
 *     default state for it (Enabled, Disabled or Forced).
 *   - Access: ordered rules (users, groups, IP addresses) that override the
 *     default, like the MFA custom rules.
 *   - Settings: for the organisation's own apps, the SSO details to give the
 *     app, its secret and its settings; for a Keston-wide app a TKG Admin
 *     manages, its sign-in details and settings, and retiring it.
 * Apps registered by Keston's deployment can't be changed here.
 */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const appId = route.params.appId as string
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const app = ref<AppInfo>()
const own = ref<OwnApp>()
const keston = ref<KestonApp>()
const error = ref<string>()
/** A secret just made: shown once (from adding the app, or a new one). */
const secret = ref<string | undefined>(history.state?.clientSecret)

async function loadApp() {
  app.value = await api.app(orgId, appId)
}
onMounted(async () => {
  try {
    await loadApp()
    if (app.value!.own) own.value = (await ownApps.get(orgId, appId)).app
    else if (app.value!.canManage) keston.value = (await kestonApps.get(orgId, appId)).app
  } catch (e) {
    error.value = message(e)
  }
})

// ── Tabs ─────────────────────────────────────────────────────────────────────

const hasSettings = computed(() => !!own.value || !!keston.value)
const tabs = computed(() => [
  { value: 'overview', label: t('apps.tabs.overview'), icon: AppWindow },
  { value: 'access', label: t('apps.tabs.access'), icon: ShieldCheck },
  ...(hasSettings.value ? [{ value: 'settings', label: t('apps.tabs.settings'), icon: Settings }] : []),
])
const tab = computed({
  get: () => {
    const q = route.query.tab
    return q === 'access' || (q === 'settings' && hasSettings.value) ? (q as string) : 'overview'
  },
  set: (v: string | undefined) => router.replace({ query: { ...route.query, tab: v && v !== 'overview' ? v : undefined } }),
})

const trail = computed(() => [{ label: t('nav.apps'), to: `/organisations/${orgId}/apps` }, { label: app.value?.name ?? t('titles.app') }])

// ── Overview ─────────────────────────────────────────────────────────────────

const typeLabel = computed(() => (app.value ? t(`apps.type.${app.value.type}`) : ''))
const managedBy = computed(() => {
  const a = app.value
  if (!a) return ''
  if (a.own) return t('apps.overview.managedByOrganisation')
  return a.managedBy === 'deployment' ? t('apps.overview.managedByDeployment') : t('apps.overview.managedByAdmin')
})
const overview = computed(() => {
  const a = app.value
  if (!a) return []
  return [
    { label: t('apps.overview.publisher'), value: a.publisher },
    { label: t('apps.overview.description'), value: a.description || t('apps.overview.noDescription') },
    { label: t('apps.overview.type'), value: typeLabel.value },
    { label: t('apps.overview.managedBy'), value: managedBy.value },
  ]
})

const UNSET = 'unset'
const modeOptions = computed(() => [
  { label: t('apps.mode.enabled'), value: 'enabled', description: t('apps.mode.enabledDescription') },
  { label: t('apps.mode.disabled'), value: 'disabled', description: t('apps.mode.disabledDescription') },
  { label: t('apps.mode.forced'), value: 'forced', description: t('apps.mode.forcedDescription') },
])
const defaultOptions = computed(() => [
  { label: app.value?.builtin ? t('apps.kestonDefault') : t('apps.notSet'), value: UNSET },
  ...modeOptions.value,
])
const saving = ref<{ status?: SelectProps['status']; text?: string }>({})
async function changeDefault(value: string) {
  const a = app.value!
  const mode = value === UNSET ? '' : (value as AppMode)
  saving.value = { status: 'loading', text: t('settings.saving') }
  try {
    await api.setAppAccess(orgId, a.id, mode)
    a.defaultMode = mode
    saving.value = { status: 'success', text: t('common.saved') }
    setTimeout(() => {
      if (saving.value.status === 'success') saving.value = {}
    }, 2000)
  } catch (e) {
    saving.value = { status: 'error', text: t('settings.couldntSave') }
    notify({ type: 'error', title: t('apps.overview.couldntSave'), description: message(e) })
  }
}

// ── Access ───────────────────────────────────────────────────────────────────

const options = ref<AppRuleOptions>()
const optionsError = ref<string>()
watch(
  tab,
  async (v) => {
    if (v !== 'access' || options.value) return
    try {
      options.value = await api.appRuleOptions(orgId, appId)
    } catch (e) {
      optionsError.value = message(e)
    }
  },
  { immediate: true },
)
/** The rules changed: the count on the Overview tab. */
async function rulesChanged() {
  try {
    await loadApp()
  } catch {
    /* the count is just a little out of date */
  }
}

// ── Settings: SSO details, secret, form ──────────────────────────────────────

const details = computed(() => {
  const a = own.value
  if (a) {
    if (a.oidc) {
      return [
        { label: t('ownApp.details.clientId'), value: a.oidc.clientId, copyable: true },
        { label: t('ownApp.details.clientSecret'), value: a.oidc.type === 'web' ? t('ownApp.details.shownOnce') : t('ownApp.details.pkce') },
        { label: t('ownApp.details.issuer'), value: a.oidc.issuer, copyable: true },
        { label: t('ownApp.details.discoveryUrl'), value: a.oidc.discoveryUrl, copyable: true },
        { label: t('ownApp.details.scopes'), value: a.oidc.scopes.join(' ') },
      ]
    }
    const idp = a.saml!.idp
    return [
      { label: t('ownApp.details.metadataUrl'), value: idp.metadataUrl, description: t('ownApp.details.metadataUrlDescription'), copyable: true },
      { label: t('ownApp.details.entityId'), value: idp.entityId, copyable: true },
      { label: t('ownApp.details.ssoUrl'), value: idp.ssoUrl, description: t('ownApp.details.ssoUrlDescription'), copyable: true },
      { label: t('ownApp.details.startUrl'), value: idp.startUrl, description: t('ownApp.details.startUrlDescription'), copyable: true },
      { label: t('ownApp.details.nameId'), value: t('common.email'), description: idp.nameIdFormat },
      { label: t('ownApp.details.attributes'), value: idp.attributes.join(', ') },
    ]
  }
  const k = keston.value
  if (!k) return []
  return [
    { label: t('ownApp.details.clientId'), value: k.id, copyable: true },
    { label: t('ownApp.details.clientSecret'), value: k.type === 'web' ? t('ownApp.details.shownOnce') : t('ownApp.details.pkce') },
    { label: t('ownApp.details.issuer'), value: k.issuer, copyable: true },
    { label: t('ownApp.details.discoveryUrl'), value: k.discoveryUrl, copyable: true },
    { label: t('ownApp.details.scopes'), value: k.scopes.join(' ') },
  ]
})
const hasSecret = computed(() => (own.value ? own.value.oidc?.type === 'web' : keston.value?.type === 'web'))

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify({ type: 'success', title: t('ownApp.copied', { what }) })
  } catch {
    notify({ type: 'error', title: t('ownApp.couldntCopy'), description: t('ownApp.couldntCopyDescription') })
  }
}

function downloadCertificate() {
  const pem = own.value?.saml?.idp.certificate
  if (!pem) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([pem], { type: 'application/x-pem-file' }))
  a.download = 'keston-id-saml.pem'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function saveOwn(body: OwnAppChanges) {
  own.value = (await ownApps.update(orgId, appId, body)).app
  await loadApp()
}
async function saveKeston(body: KestonAppChanges) {
  keston.value = (await kestonApps.update(orgId, appId, body)).app
  await loadApp()
}

// A new secret.
const rotating = ref(false)
const rotateStatus = ref<ButtonStatus>('idle')
async function newSecret() {
  rotateStatus.value = 'loading'
  try {
    if (own.value) {
      const res = await ownApps.newSecret(orgId, appId)
      own.value = res.app
      secret.value = res.clientSecret
    } else {
      const res = await kestonApps.newSecret(orgId, appId)
      keston.value = res.app
      secret.value = res.clientSecret
    }
    rotating.value = false
  } catch (e) {
    notify({ type: 'error', title: t('ownApp.couldntMakeSecret'), description: message(e) })
  } finally {
    rotateStatus.value = 'idle'
  }
}

// Deleting one of your own apps.
const deleting = ref(false)
const deleteStatus = ref<ButtonStatus>('idle')
async function remove() {
  deleteStatus.value = 'loading'
  try {
    await ownApps.remove(orgId, appId)
    notify({ type: 'success', title: t('groupDetail.deleted', { name: app.value!.name }), description: t('ownApp.deletedDescription') })
    router.push(`/organisations/${orgId}/apps`)
  } catch (e) {
    deleteStatus.value = 'idle'
    notify({ type: 'error', title: t('groupDetail.couldntDelete'), description: message(e) })
  }
}

// Retiring or restoring a Keston-wide app.
const retiring = ref(false)
const retireStatus = ref<ButtonStatus>('idle')
async function setRetired(retire: boolean) {
  const name = app.value!.name
  retireStatus.value = 'loading'
  try {
    keston.value = (retire ? await kestonApps.retire(orgId, appId) : await kestonApps.restore(orgId, appId)).app
    await loadApp()
    retiring.value = false
    notify({ type: 'success', title: t(retire ? 'apps.settings.retired' : 'apps.settings.restored', { name }) })
  } catch (e) {
    notify({ type: 'error', title: t(retire ? 'apps.settings.couldntRetire' : 'apps.settings.couldntRestore'), description: message(e) })
  } finally {
    retireStatus.value = 'idle'
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('ownApp.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!app" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="app.name" :description="t('apps.publishedBy', { publisher: app.publisher })">
        <template #badge>
          <Badge v-if="app.retired" color="red">{{ t('apps.retiredBadge') }}</Badge>
          <Badge v-else-if="app.kestonWide && app.managedBy === 'deployment'" color="basic">{{ t('apps.managedByDeployment') }}</Badge>
          <Badge v-else color="basic">{{ typeLabel }}</Badge>
        </template>
        <template v-if="own" #actions>
          <Button variant="danger" @click="deleting = true">
            <template #leading><Trash2 /></template>
            {{ t('common.delete') }}
          </Button>
        </template>
      </PageHeader>

      <Card v-if="secret" :title="t('ownApp.details.clientSecret')" :description="t('ownApp.secretDescription')">
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded border border-black/15 bg-black/5 px-3 py-2 font-mono text-sm">{{ secret }}</code>
          <Button @click="copy(secret!, t('ownApp.secret'))">
            <template #leading><Copy /></template>
            {{ t('common.copy') }}
          </Button>
        </div>
      </Card>

      <Card v-if="app.retired">
        <p class="text-sm">{{ t('apps.retiredDescription') }}</p>
      </Card>

      <Tabs v-model="tab" :tabs="tabs" :label="t('apps.tabs.label')">
        <template #overview>
          <div class="flex flex-col gap-6">
            <Card :title="t('apps.overview.details')">
              <SummaryList :items="overview" />
              <p v-if="app.kestonWide && app.managedBy === 'deployment'" class="mt-3 text-sm text-black/65">
                {{ t('apps.managedByDeploymentDescription') }}
              </p>
            </Card>
            <Card :title="t('apps.overview.defaultTitle')" :description="t('apps.overview.defaultDescription')">
              <Select
                :model-value="app.defaultMode || UNSET"
                :label="t('apps.overview.defaultLabel')"
                :helper="t('apps.overview.defaultHelper')"
                :options="defaultOptions"
                :status="saving.status"
                :status-text="saving.text"
                class="max-w-sm"
                @update:model-value="changeDefault(String($event ?? UNSET))"
              />
              <p class="mt-3 text-sm text-black/65">{{ t('apps.overview.ruleCount', app.ruleCount) }}</p>
            </Card>
          </div>
        </template>

        <template #access>
          <div class="flex flex-col gap-4">
            <p class="text-sm text-black/65">
              {{ app.defaultMode ? t('apps.access.defaultIs', { mode: t(`apps.mode.${app.defaultMode}`) }) : app.fallback ? t('apps.access.defaultIs', { mode: t(`apps.mode.${app.fallback}`) }) : t('apps.access.defaultNotSet') }}.
              {{ t('apps.access.defaultChange') }} {{ t('apps.access.precedence') }}
            </p>
            <Card v-if="optionsError">
              <EmptyState :icon="TriangleAlert" :title="t('apps.rules.couldntLoad')" :description="optionsError" />
            </Card>
            <div v-else-if="!options" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
            <AppRulesCard v-else :org-id="orgId" :app-id="appId" :options="options" @changed="rulesChanged" />
          </div>
        </template>

        <template v-if="hasSettings" #settings>
          <div class="flex flex-col gap-6">
            <Card v-if="keston" :title="t('apps.settings.kestonTitle')" :description="t('apps.settings.kestonDescription')" />
            <Card :title="t('ownApp.ssoTitle')" :description="t('ownApp.ssoDescription', { name: app.name })">
              <SummaryList :items="details">
                <template #action="{ item }">
                  <Button v-if="item.copyable" size="sm" variant="ghost" @click="copy(String(item.value), item.label)">
                    <template #leading><Copy /></template>
                    {{ t('common.copy') }}<span class="sr-only"> {{ item.label }}</span>
                  </Button>
                </template>
              </SummaryList>
              <template v-if="own?.saml || hasSecret" #footer>
                <Button v-if="own?.saml" @click="downloadCertificate">
                  <template #leading><Download /></template>
                  {{ t('ownApp.downloadCertificate') }}
                </Button>
                <Button v-else @click="rotating = true">
                  <template #leading><KeyRound /></template>
                  {{ t('ownApp.newSecret') }}
                </Button>
              </template>
            </Card>

            <Card :title="t('settings.title')">
              <OwnAppForm v-if="own" :protocol="own.protocol" :app="own" :submit-label="t('ownApp.saveChanges')" :save="saveOwn" />
              <KestonAppForm v-else-if="keston" :app="keston" :submit-label="t('ownApp.saveChanges')" :save="saveKeston" />
            </Card>

            <Card v-if="keston" :title="keston.retired ? t('apps.settings.restore') : t('apps.settings.retire')">
              <p class="text-sm text-black/65">{{ keston.retired ? t('apps.retiredDescription') : t('apps.settings.retireDescription') }}</p>
              <template #footer>
                <Button v-if="keston.retired" :status="retireStatus" @click="setRetired(false)">
                  <template #leading><Undo2 /></template>
                  {{ t('apps.settings.restore') }}
                </Button>
                <Button v-else variant="danger" @click="retiring = true">{{ t('apps.settings.retire') }}</Button>
              </template>
            </Card>
          </div>
        </template>
      </Tabs>
    </template>

    <Slideover v-model:open="rotating" :title="t('ownApp.newSecretQ')" :description="t('ownApp.newSecretDescription')">
      <template #footer="{ close }">
        <Button :disabled="rotateStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="rotateStatus" :loading-text="t('ownApp.generating')" @click="newSecret">{{ t('ownApp.newSecret') }}</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="deleting"
      :title="app ? t('groupDetail.deleteTitle', { name: app.name }) : t('ownApp.deleteApp')"
      :description="t('ownApp.deleteDescription')"
    >
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :status="deleteStatus" :loading-text="t('common.deleting')" @click="remove">{{ t('ownApp.deleteApp') }}</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="retiring"
      :title="app ? t('apps.settings.retireTitle', { name: app.name }) : t('apps.settings.retire')"
      :description="t('apps.settings.retireDescription')"
    >
      <template #footer="{ close }">
        <Button :disabled="retireStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="danger" :status="retireStatus" :loading-text="t('common.saving')" @click="setRetired(true)">{{ t('apps.settings.retire') }}</Button>
      </template>
    </Slideover>
  </div>
</template>
