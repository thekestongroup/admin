<script setup lang="ts">
import { Button, type ButtonStatus, CheckboxGroup, Input, InputTextArea, RadioGroup, type RadioOption } from '@thekestongroup/ui'
import { computed, reactive, ref } from 'vue'
import { ApiError, type OwnApp, type OwnAppChanges, type OwnAppType } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  description: props.app?.description ?? '',
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

const types = computed<RadioOption[]>(() => [
  { label: t('ownApp.type.web'), value: 'web', description: t('ownApp.type.webDescription') },
  { label: t('ownApp.type.native'), value: 'native', description: t('ownApp.type.nativeDescription') },
])
const scopeOptions = computed(() => [
  { value: 'profile', label: t('ownApp.scopes.profile'), description: 'profile' },
  { value: 'email', label: t('ownApp.scopes.email'), description: 'email' },
  { value: 'offline_access', label: t('ownApp.scopes.offline'), description: 'offline_access' },
])
const sources = computed<RadioOption[]>(() => [
  { label: t('ownApp.source.url'), value: 'url', description: t('ownApp.source.urlDescription') },
  { label: t('ownApp.source.xml'), value: 'xml', description: t('ownApp.source.xmlDescription') },
  { label: t('ownApp.source.manual'), value: 'manual', description: t('ownApp.source.manualDescription') },
])

const isOIDC = props.protocol === 'oidc'
const sourceLabel = computed(() => (adding ? t('ownApp.samlDetails') : t('ownApp.updateSamlDetails')))
const redirectHelp = computed(() =>
  fields.type === 'native'
    ? t('ownApp.redirectHelpNative')
    : t('ownApp.redirectHelp'),
)


const errors = ref<Record<string, string>>({})
const status = ref<ButtonStatus>('idle')

function body(): OwnAppChanges {
  const b: OwnAppChanges = { name: fields.name, description: fields.description, logoUrl: fields.logoUrl }
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
    errors.value = { name: t('ownApp.enterName') }
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
    <Input v-model="fields.name" :label="t('common.name')" :helper="t('ownApp.nameHelper')" :error-text="errors.name" />
    <InputTextArea
      v-model="fields.description"
      :label="t('ownApp.description')"
      :helper="t('ownApp.descriptionHelper')"
      :error-text="errors.description"
    />

    <template v-if="protocol === 'oidc'">
      <RadioGroup v-if="adding" v-model="fields.type" :label="t('ownApp.typeOfApp')" :options="types" :error-text="errors.type" />
      <InputTextArea
        v-model="fields.redirectUris"
        :label="t('ownApp.redirectUris')"
        :helper="redirectHelp"
        :error-text="errors.redirectUris"
      />
      <InputTextArea
        v-model="fields.postLogoutRedirectUris"
        :label="t('ownApp.signOutUris')"
        :helper="t('ownApp.signOutHelper')"
        :error-text="errors.postLogoutRedirectUris"
      />
      <CheckboxGroup
        v-model="fields.scopes"
        :label="t('ownApp.scopes.label')"
        :helper="t('ownApp.scopes.helper')"
        :options="scopeOptions"
        :error-text="errors.scopes"
      />
    </template>

    <template v-if="!isOIDC">
      <RadioGroup v-model="source" :label="sourceLabel" :options="sources" />
      <Input
        v-if="source === 'url'"
        v-model="fields.metadataUrl"
        :label="t('ownApp.metadataUrl')"
        :error-text="errors.metadataUrl"
      />
      <InputTextArea
        v-else-if="source === 'xml'"
        v-model="fields.metadataXml"
        :label="t('ownApp.metadata')"
        :error-text="errors.metadataXml"
      />
      <template v-else>
        <Input v-model="fields.entityId" :label="t('ownApp.entityId')" :helper="t('ownApp.entityIdHelper')" :error-text="errors.entityId" />
        <Input
          v-model="fields.acsUrl"
          :label="t('ownApp.acsUrl')"
          :helper="t('ownApp.acsUrlHelper')"
          :error-text="errors.acsUrl"
        />
      </template>
      <p v-if="source !== 'manual' && (errors.entityId || errors.acsUrl)" class="text-xs text-red" role="alert">
        {{ errors.entityId || errors.acsUrl }}
      </p>
    </template>

    <Input v-model="fields.logoUrl" :label="t('ownApp.logoUrl')" :error-text="errors.logoUrl" />
    <template v-if="protocol === 'oidc'">
      <Input v-model="fields.privacyUrl" :label="t('ownApp.privacyUrl')" :error-text="errors.privacyUrl" />
      <Input v-model="fields.termsUrl" :label="t('ownApp.termsUrl')" :error-text="errors.termsUrl" />
    </template>

    <p v-if="errors.form" class="text-sm text-red" role="alert">{{ errors.form }}</p>
    <div>
      <Button type="submit" variant="primary" v-model:status="status" :loading-text="t('common.saving')" :success-text="t('common.saved')">
        {{ submitLabel }}
      </Button>
    </div>
  </form>
</template>
