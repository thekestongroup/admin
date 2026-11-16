<script setup lang="ts">
import { Copy, Download, KeyRound, Trash2, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Breadcrumb,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Link,
  PageHeader,
  Slideover,
  Spinner,
  SummaryList,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OwnAppForm from '../components/OwnAppForm.vue'
import { type OwnApp, type OwnAppChanges, ownApps } from '../lib/api'
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * One of the organisation's own apps: what to put in the app's SSO
 * settings, its secret (shown once), its settings, and deleting it. Who has
 * it is set on the Apps page, like any other app.
 */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string
const appId = route.params.appId as string
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const app = ref<OwnApp>()
const error = ref<string>()
/** A secret just made: shown once (from adding the app, or a new one). */
const secret = ref<string | undefined>(history.state?.clientSecret)

onMounted(async () => {
  try {
    app.value = (await ownApps.get(orgId, appId)).app
  } catch (e) {
    error.value = message(e)
  }
})

const trail = computed(() => [{ label: t('nav.apps'), to: `/organisations/${orgId}/apps` }, { label: app.value?.name ?? t('titles.app') }])

/** What to put in the app's SSO settings. */
const details = computed(() => {
  const a = app.value
  if (!a) return []
  if (a.oidc) {
    return [
      { label: t('ownApp.details.clientId'), value: a.oidc.clientId, copyable: true },
      {
        label: t('ownApp.details.clientSecret'),
        value: a.oidc.type === 'web' ? t('ownApp.details.shownOnce') : t('ownApp.details.pkce'),
      },
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
})

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify({ type: 'success', title: t('ownApp.copied', { what }) })
  } catch {
    notify({ type: 'error', title: t('ownApp.couldntCopy'), description: t('ownApp.couldntCopyDescription') })
  }
}

function downloadCertificate() {
  const pem = app.value?.saml?.idp.certificate
  if (!pem) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([pem], { type: 'application/x-pem-file' }))
  a.download = 'keston-id-saml.pem'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function save(body: OwnAppChanges) {
  app.value = (await ownApps.update(orgId, appId, body)).app
}

// A new secret.
const rotating = ref(false)
const rotateStatus = ref<ButtonStatus>('idle')
async function newSecret() {
  rotateStatus.value = 'loading'
  try {
    const res = await ownApps.newSecret(orgId, appId)
    app.value = res.app
    secret.value = res.clientSecret
    rotating.value = false
  } catch (e) {
    notify({ type: 'error', title: t('ownApp.couldntMakeSecret'), description: message(e) })
  } finally {
    rotateStatus.value = 'idle'
  }
}

// Deleting it.
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
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('ownApp.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!app" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="app.name" :description="t('ownApp.onlyYourUsers')">
        <template #badge>
          <Badge color="basic">{{ app.protocol === 'saml' ? 'SAML' : 'OpenID Connect' }}</Badge>
        </template>
        <template #actions>
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

      <Card :title="t('ownApp.ssoTitle')" :description="t('ownApp.ssoDescription', { name: app.name })">
        <SummaryList :items="details">
          <template #action="{ item }">
            <Button v-if="item.copyable" size="sm" variant="ghost" @click="copy(String(item.value), item.label)">
              <template #leading><Copy /></template>
              {{ t('common.copy') }}<span class="sr-only"> {{ item.label }}</span>
            </Button>
          </template>
        </SummaryList>
        <template v-if="app.saml || app.oidc?.type === 'web'" #footer>
          <Button v-if="app.saml" @click="downloadCertificate">
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
        <OwnAppForm :protocol="app.protocol" :app="app" :submit-label="t('ownApp.saveChanges')" :save="save" />
      </Card>

      <p class="text-sm text-black/65">
        <I18nT keypath="ownApp.chooseWho" scope="global">
          <template #link><Link :as="RouterLink" :to="`/organisations/${orgId}/apps`">{{ t('ownApp.appsPage') }}</Link></template>
        </I18nT>
      </p>
    </template>

    <Slideover
      v-model:open="rotating"
      :title="t('ownApp.newSecretQ')"
      :description="t('ownApp.newSecretDescription')"
    >
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
  </div>
</template>
