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

const trail = computed(() => [{ label: 'Apps', to: `/organisations/${orgId}/apps` }, { label: app.value?.name ?? 'App' }])

/** What to put in the app's SSO settings. */
const details = computed(() => {
  const a = app.value
  if (!a) return []
  if (a.oidc) {
    return [
      { label: 'Client ID', value: a.oidc.clientId },
      {
        label: 'Client secret',
        value: a.oidc.type === 'web' ? 'Shown once when it’s made' : 'None: signs in with PKCE',
      },
      { label: 'Issuer', value: a.oidc.issuer },
      { label: 'Discovery URL', value: a.oidc.discoveryUrl },
      { label: 'Scopes', value: a.oidc.scopes.join(' ') },
    ]
  }
  const idp = a.saml!.idp
  return [
    { label: 'IdP metadata URL', value: idp.metadataUrl, description: 'Most apps only need this.' },
    { label: 'IdP entity ID (issuer)', value: idp.entityId },
    { label: 'Sign-in URL (SSO URL)', value: idp.ssoUrl, description: 'HTTP-Redirect or HTTP-POST.' },
    { label: 'Start sign-in from Keston', value: idp.startUrl, description: 'IdP-initiated sign-in: a link straight to the app.' },
    { label: 'NameID', value: 'Email address', description: idp.nameIdFormat },
    { label: 'Attributes', value: idp.attributes.join(', ') },
  ]
})
const copyable = new Set(['Client ID', 'Issuer', 'Discovery URL', 'IdP metadata URL', 'IdP entity ID (issuer)', 'Sign-in URL (SSO URL)', 'Start sign-in from Keston'])

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify({ type: 'success', title: `${what} copied` })
  } catch {
    notify({ type: 'error', title: 'Couldn’t copy it', description: 'Select it and copy it yourself.' })
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
    notify({ type: 'error', title: 'Couldn’t make a new secret', description: message(e) })
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
    notify({ type: 'success', title: `${app.value!.name} deleted`, description: 'Your users can no longer sign in to it.' })
    router.push(`/organisations/${orgId}/apps`)
  } catch (e) {
    deleteStatus.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t delete it', description: message(e) })
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the app" :description="error" />
    </Card>
    <div v-else-if="!app" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Breadcrumb :items="trail" :link-component="RouterLink" />
      <PageHeader :title="app.name" description="Only your organisation’s users can sign in to it.">
        <template #badge>
          <Badge color="basic">{{ app.protocol === 'saml' ? 'SAML' : 'OpenID Connect' }}</Badge>
        </template>
        <template #actions>
          <Button variant="danger" @click="deleting = true">
            <template #leading><Trash2 /></template>
            Delete
          </Button>
        </template>
      </PageHeader>

      <Card v-if="secret" title="Client secret" description="Copy it into the app now. You won’t be able to see it again.">
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded border border-black/15 bg-black/5 px-3 py-2 font-mono text-sm">{{ secret }}</code>
          <Button @click="copy(secret!, 'Secret')">
            <template #leading><Copy /></template>
            Copy
          </Button>
        </div>
      </Card>

      <Card title="For the app’s SSO settings" :description="`Put these in ${app.name}’s single sign-on settings.`">
        <SummaryList :items="details">
          <template #action="{ item }">
            <Button v-if="copyable.has(item.label)" size="sm" variant="ghost" @click="copy(String(item.value), item.label)">
              <template #leading><Copy /></template>
              Copy<span class="sr-only"> {{ item.label }}</span>
            </Button>
          </template>
        </SummaryList>
        <template v-if="app.saml || app.oidc?.type === 'web'" #footer>
          <Button v-if="app.saml" @click="downloadCertificate">
            <template #leading><Download /></template>
            Download the signing certificate
          </Button>
          <Button v-else @click="rotating = true">
            <template #leading><KeyRound /></template>
            Generate a new secret
          </Button>
        </template>
      </Card>

      <Card title="Settings">
        <OwnAppForm :protocol="app.protocol" :app="app" submit-label="Save changes" :save="save" />
      </Card>

      <p class="text-sm text-black/65">
        Choose who has it (Forced, Enabled or Disabled) on the
        <Link :as="RouterLink" :to="`/organisations/${orgId}/apps`">Apps page</Link>.
      </p>
    </template>

    <Slideover
      v-model:open="rotating"
      title="Generate a new secret?"
      description="The current secret stops working straight away, so the app can’t sign anyone in until you give it the new one."
    >
      <template #footer="{ close }">
        <Button :disabled="rotateStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="rotateStatus" loading-text="Generating" @click="newSecret">Generate a new secret</Button>
      </template>
    </Slideover>

    <Slideover
      v-model:open="deleting"
      :title="app ? `Delete ${app.name}?` : 'Delete app?'"
      description="Your users can no longer sign in to it, and its access settings are removed. This can’t be undone."
    >
      <template #footer="{ close }">
        <Button :disabled="deleteStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="danger" :status="deleteStatus" loading-text="Deleting" @click="remove">Delete app</Button>
      </template>
    </Slideover>
  </div>
</template>
