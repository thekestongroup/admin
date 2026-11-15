<script setup lang="ts">
import { Button, type ButtonStatus, Checkbox, Input, RadioGroup, type RadioOption } from '@thekestongroup/ui'
import { computed, reactive, ref } from 'vue'
import { ApiError, type OwnApp, type OwnAppChanges, type OwnAppType } from '../lib/api'
import TextAreaField from './TextAreaField.vue'

/**
 * Adding or changing one of the organisation's own apps: OpenID Connect
 * (type, redirect and sign-out URIs, scopes) or SAML (metadata from a URL,
 * pasted, or an entity ID and ACS URL), plus name and links. save() throws
 * the API's error, which is shown by the field it names.
 */
const props = defineProps<{
  protocol: OwnApp['protocol']
  /** The app being changed; none when adding one. */
  app?: OwnApp
  submitLabel: string
  save: (body: OwnAppChanges) => Promise<void>
}>()

const adding = !props.app
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)

const fields = reactive({
  name: props.app?.name ?? '',
  logoUrl: props.app?.logoUrl ?? '',
  privacyUrl: props.app?.privacyUrl ?? '',
  termsUrl: props.app?.termsUrl ?? '',
  type: (props.app?.oidc?.type ?? 'web') as OwnAppType,
  redirectUris: (props.app?.oidc?.redirectUris ?? []).join('\n'),
  postLogoutRedirectUris: (props.app?.oidc?.postLogoutRedirectUris ?? []).join('\n'),
  scopes: props.app?.oidc?.scopes ?? ['openid', 'profile', 'email'],
  metadataUrl: props.app?.saml?.metadataUrl ?? '',
  metadataXml: '',
  entityId: props.app?.saml?.entityId ?? '',
  acsUrl: props.app?.saml?.acsUrl ?? '',
})

/** SAML: where its details come from. */
const source = ref<'url' | 'xml' | 'manual'>(props.app?.saml && !props.app.saml.metadataUrl ? 'manual' : 'url')

const types: RadioOption[] = [
  { label: 'Web app', value: 'web', description: 'Runs on a server, which keeps a client secret.' },
  {
    label: 'Single-page or mobile app',
    value: 'native',
    description: 'Runs in the browser or on a device, so it can’t keep a secret. Signs in with PKCE.',
  },
]
const scopeOptions = [
  { id: 'profile', label: 'Name and profile picture' },
  { id: 'email', label: 'Email address' },
  { id: 'offline_access', label: 'Stay signed in (refresh tokens)' },
]
const sources: RadioOption[] = [
  { label: 'Metadata URL', value: 'url', description: 'Keston ID downloads the app’s SAML metadata.' },
  { label: 'Paste the metadata', value: 'xml', description: 'The XML from the app’s SAML settings.' },
  { label: 'Entity ID and ACS URL', value: 'manual', description: 'If the app doesn’t give you metadata.' },
]

const isOIDC = props.protocol === 'oidc'
const sourceLabel = adding ? 'The app’s SAML details' : 'Update its SAML details from'
const redirectHelp = computed(() =>
  fields.type === 'native'
    ? 'Where Keston ID sends people back to after signing in, one per line: https:// or your app’s own scheme (e.g. com.example.app:/callback).'
    : 'Where Keston ID sends people back to after signing in, one per line (https://).',
)

function toggleScope(id: string, on: boolean) {
  fields.scopes = on ? [...fields.scopes, id] : fields.scopes.filter((s) => s !== id)
}

const errors = ref<Record<string, string>>({})
const status = ref<ButtonStatus>('idle')

function body(): OwnAppChanges {
  const b: OwnAppChanges = { name: fields.name, logoUrl: fields.logoUrl }
  if (props.protocol === 'oidc') {
    Object.assign(b, {
      privacyUrl: fields.privacyUrl,
      termsUrl: fields.termsUrl,
      redirectUris: lines(fields.redirectUris),
      postLogoutRedirectUris: lines(fields.postLogoutRedirectUris),
      scopes: fields.scopes.filter((s) => s !== 'openid'),
    })
    if (adding) b.type = fields.type
    return b
  }
  if (source.value === 'url') b.metadataUrl = fields.metadataUrl
  else if (source.value === 'xml') b.metadataXml = fields.metadataXml
  else Object.assign(b, { entityId: fields.entityId, acsUrl: fields.acsUrl })
  return b
}

async function submit() {
  errors.value = {}
  if (!fields.name.trim()) {
    errors.value = { name: 'Enter the app’s name' }
    return
  }
  status.value = 'loading'
  try {
    await props.save(body())
    status.value = adding ? 'idle' : 'success'
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors.value = { [e.field]: e.message }
    else errors.value = { form: e instanceof Error ? e.message : String(e) }
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <Input v-model="fields.name" label="Name" helper="What your users see, e.g. on their Connected apps page." :error-text="errors.name" />

    <template v-if="protocol === 'oidc'">
      <RadioGroup v-if="adding" v-model="fields.type" label="Type of app" :options="types" :error-text="errors.type" />
      <TextAreaField
        v-model="fields.redirectUris"
        label="Redirect URIs"
        :helper="redirectHelp"
        :error-text="errors.redirectUris"
      />
      <TextAreaField
        v-model="fields.postLogoutRedirectUris"
        label="Sign-out URIs (optional)"
        helper="Where the app may send people after they sign out, one per line."
        :rows="2"
        :error-text="errors.postLogoutRedirectUris"
      />
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm">What the app gets</legend>
        <p class="text-xs text-black/65">It always gets a user ID. Your users aren’t asked to allow it, as your organisation set it up.</p>
        <Checkbox
          v-for="s in scopeOptions"
          :key="s.id"
          :model-value="fields.scopes.includes(s.id)"
          :label="s.label"
          :description="s.id"
          @update:model-value="toggleScope(s.id, $event === true)"
        />
        <p v-if="errors.scopes" class="text-xs text-red" role="alert">{{ errors.scopes }}</p>
      </fieldset>
    </template>

    <template v-if="!isOIDC">
      <RadioGroup v-model="source" :label="sourceLabel" :options="sources" />
      <Input
        v-if="source === 'url'"
        v-model="fields.metadataUrl"
        label="Metadata URL"
        :error-text="errors.metadataUrl"
      />
      <TextAreaField
        v-else-if="source === 'xml'"
        v-model="fields.metadataXml"
        label="Metadata"
        :rows="8"
        :error-text="errors.metadataXml"
      />
      <template v-else>
        <Input v-model="fields.entityId" label="Entity ID" helper="Also called the audience or SP entity ID." :error-text="errors.entityId" />
        <Input
          v-model="fields.acsUrl"
          label="ACS URL"
          helper="Assertion consumer service: where Keston ID sends the sign-in response."
          :error-text="errors.acsUrl"
        />
      </template>
      <p v-if="source !== 'manual' && (errors.entityId || errors.acsUrl)" class="text-xs text-red" role="alert">
        {{ errors.entityId || errors.acsUrl }}
      </p>
    </template>

    <Input v-model="fields.logoUrl" label="Logo URL (optional)" :error-text="errors.logoUrl" />
    <template v-if="protocol === 'oidc'">
      <Input v-model="fields.privacyUrl" label="Privacy policy URL (optional)" :error-text="errors.privacyUrl" />
      <Input v-model="fields.termsUrl" label="Terms URL (optional)" :error-text="errors.termsUrl" />
    </template>

    <p v-if="errors.form" class="text-sm text-red" role="alert">{{ errors.form }}</p>
    <div>
      <Button type="submit" variant="primary" v-model:status="status" loading-text="Saving" success-text="Saved">
        {{ submitLabel }}
      </Button>
    </div>
  </form>
</template>
