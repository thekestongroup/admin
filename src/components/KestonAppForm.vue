<script setup lang="ts">
import { Button, type ButtonStatus, CheckboxGroup, Input, InputTextArea, RadioGroup, type RadioOption } from '@thekestongroup/ui'
import { computed, reactive, ref } from 'vue'
import { ApiError, type KestonApp, type KestonAppChanges } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Adding or changing a Keston-wide app (TKG Admins): name, description, type
 * (web, with a secret, or single-page/mobile with PKCE; only when adding),
 * redirect and sign-out URIs, scopes and links. save() throws the API's
 * error, which is shown by the field it names. The publisher is always The
 * Keston Group.
 */
const props = defineProps<{
  /** The app being changed; none when adding one. */
  app?: KestonApp
  submitLabel: string
  save: (body: KestonAppChanges) => Promise<void>
}>()

const adding = !props.app
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)

const fields = reactive({
  name: props.app?.name ?? '',
  description: props.app?.description ?? '',
  type: (props.app?.type ?? 'web') as 'web' | 'native',
  redirectUris: (props.app?.redirectUris ?? []).join('\n'),
  postLogoutRedirectUris: (props.app?.postLogoutRedirectUris ?? []).join('\n'),
  scopes: (props.app?.scopes ?? ['openid', 'profile', 'email']).filter((s) => s !== 'openid'),
  logoUrl: props.app?.logoUrl ?? '',
  privacyUrl: props.app?.privacyUrl ?? '',
  termsUrl: props.app?.termsUrl ?? '',
})

const types = computed<RadioOption[]>(() => [
  { label: t('ownApp.type.web'), value: 'web', description: t('ownApp.type.webDescription') },
  { label: t('ownApp.type.native'), value: 'native', description: t('ownApp.type.nativeDescription') },
])
const scopeOptions = computed(() => [
  { value: 'profile', label: t('ownApp.scopes.profile'), description: 'profile' },
  { value: 'email', label: t('ownApp.scopes.email'), description: 'email' },
  { value: 'offline_access', label: t('ownApp.scopes.offline'), description: 'offline_access' },
])
const redirectHelp = computed(() => (fields.type === 'native' ? t('ownApp.redirectHelpNative') : t('ownApp.redirectHelp')))

const errors = ref<Record<string, string>>({})
const status = ref<ButtonStatus>('idle')

async function submit() {
  errors.value = {}
  if (!fields.name.trim()) {
    errors.value = { name: t('ownApp.enterName') }
    return
  }
  const body: KestonAppChanges = {
    name: fields.name,
    description: fields.description,
    logoUrl: fields.logoUrl,
    privacyUrl: fields.privacyUrl,
    termsUrl: fields.termsUrl,
    redirectUris: lines(fields.redirectUris),
    postLogoutRedirectUris: lines(fields.postLogoutRedirectUris),
    scopes: fields.scopes,
  }
  if (adding) body.type = fields.type
  status.value = 'loading'
  try {
    await props.save(body)
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
      :label="t('apps.newKeston.description_label')"
      :helper="t('apps.newKeston.descriptionHelper')"
      :error-text="errors.description"
    />
    <RadioGroup v-if="adding" v-model="fields.type" :label="t('ownApp.typeOfApp')" :options="types" :error-text="errors.type" />
    <InputTextArea v-model="fields.redirectUris" :label="t('ownApp.redirectUris')" :helper="redirectHelp" :error-text="errors.redirectUris" />
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
    <Input v-model="fields.logoUrl" :label="t('ownApp.logoUrl')" :error-text="errors.logoUrl" />
    <Input v-model="fields.privacyUrl" :label="t('ownApp.privacyUrl')" :error-text="errors.privacyUrl" />
    <Input v-model="fields.termsUrl" :label="t('ownApp.termsUrl')" :error-text="errors.termsUrl" />
    <p v-if="errors.form" class="text-sm text-red" role="alert">{{ errors.form }}</p>
    <div>
      <Button type="submit" variant="primary" v-model:status="status" :loading-text="t('common.saving')" :success-text="t('common.saved')">
        {{ submitLabel }}
      </Button>
    </div>
  </form>
</template>
