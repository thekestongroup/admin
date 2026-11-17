<script setup lang="ts">
import { Breadcrumb, Card, PageHeader } from '@thekestongroup/ui'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import KestonAppForm from '../components/KestonAppForm.vue'
import { type KestonAppChanges, kestonApps } from '../lib/api'

const { t } = useI18n()

/** Add a Keston-wide app (TKG Admins, in The Keston Group). */
const route = useRoute()
const router = useRouter()
const orgId = route.params.orgId as string

const trail = computed(() => [{ label: t('nav.apps'), to: `/organisations/${orgId}/apps` }, { label: t('apps.addKestonApp') }])

async function save(body: KestonAppChanges) {
  const res = await kestonApps.create(orgId, body)
  // A web app's secret is shown once, on the app's page.
  await router.push({
    path: `/organisations/${orgId}/apps/${res.app.id}`,
    state: res.clientSecret ? { clientSecret: res.clientSecret } : {},
  })
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Breadcrumb :items="trail" :link-component="RouterLink" />
    <PageHeader :title="t('apps.newKeston.title')" :description="t('apps.newKeston.description')" />
    <Card>
      <KestonAppForm :submit-label="t('apps.newKeston.submit')" :save="save" />
    </Card>
  </div>
</template>
