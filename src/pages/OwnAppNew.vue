<script setup lang="ts">
import { Breadcrumb, Card, PageHeader, RadioGroup } from '@thekestongroup/ui'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OwnAppForm from '../components/OwnAppForm.vue'
import { type OwnApp, type OwnAppChanges, ownApps } from '../lib/api'

/** Add an app: your own SSO app, with OpenID Connect or SAML. */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string

const protocol = ref<OwnApp['protocol']>('oidc')
const protocols = [
  { label: 'OpenID Connect', value: 'oidc', description: 'Most modern apps, and apps you build yourself (OAuth 2.0).' },
  { label: 'SAML 2.0', value: 'saml', description: 'Many business apps, e.g. ones that ask for an IdP metadata URL.' },
]
const trail = [{ label: 'Apps', to: `/organisations/${orgId}/apps` }, { label: 'Add an app' }]

async function save(body: OwnAppChanges) {
  const res = await ownApps.create(orgId, protocol.value, body)
  // The secret is shown once, on the app's page.
  await router.push({
    path: `/organisations/${orgId}/apps/own/${res.app.id}`,
    state: res.clientSecret ? { clientSecret: res.clientSecret } : {},
  })
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Breadcrumb :items="trail" :link-component="RouterLink" />
    <PageHeader
      title="Add an app"
      description="An app your organisation uses that signs people in with their Keston account. Only your users can sign in to it."
    />
    <Card>
      <RadioGroup v-model="protocol" label="How it signs people in" helper="The app’s single sign-on (SSO) settings say which it supports." :options="protocols" />
    </Card>
    <Card>
      <OwnAppForm :key="protocol" :protocol="protocol" submit-label="Add app" :save="save" />
    </Card>
  </div>
</template>
