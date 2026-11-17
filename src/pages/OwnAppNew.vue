<script setup lang="ts">
import { Breadcrumb, Card, PageHeader, RadioGroup } from '@thekestongroup/ui'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OwnAppForm from '../components/OwnAppForm.vue'
import { type OwnApp, type OwnAppChanges, ownApps } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** Add an app: your own SSO app, with OpenID Connect or SAML. */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string

const protocol = ref<OwnApp['protocol']>('oidc')
const protocols = computed(() => [
  { label: 'OpenID Connect', value: 'oidc', description: t('ownAppNew.oidcDescription') },
  { label: 'SAML 2.0', value: 'saml', description: t('ownAppNew.samlDescription') },
])
const trail = computed(() => [{ label: t('nav.apps'), to: `/organisations/${orgId}/apps` }, { label: t('apps.addApp') }])

async function save(body: OwnAppChanges) {
  const res = await ownApps.create(orgId, protocol.value, body)
  // The secret is shown once, on the app's page.
  await router.push({
    path: `/organisations/${orgId}/apps/${res.app.id}`,
    state: res.clientSecret ? { clientSecret: res.clientSecret } : {},
  })
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Breadcrumb :items="trail" :link-component="RouterLink" />
    <PageHeader
      :title="t('apps.addApp')"
      :description="t('ownAppNew.description')"
    />
    <Card>
      <RadioGroup v-model="protocol" :label="t('ownAppNew.how')" :helper="t('ownAppNew.howHelper')" :options="protocols" />
    </Card>
    <Card>
      <OwnAppForm :key="protocol" :protocol="protocol" :submit-label="t('ownAppNew.submit')" :save="save" />
    </Card>
  </div>
</template>
