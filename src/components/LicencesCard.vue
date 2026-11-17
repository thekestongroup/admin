<script setup lang="ts">
import { Button, type ButtonStatus, Card, CheckboxGroup, EmptyState, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { api, type LicenceSource, type Product } from '../lib/api'
import { RouterLink } from 'vue-router'
import { licenceOption } from '../lib/licences'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The Keston products someone has a licence for, on their page. Without
 * one, they can't sign in to that product. Editable with "Assign licences".
 */
const props = defineProps<{ orgId: string; userId: string; name: string; canEdit: boolean; sources?: LicenceSource[] }>()
const emit = defineEmits<{ saved: [] }>()
const licences = defineModel<string[]>({ required: true })
const { notify } = useNotifications()

const products = ref<Product[]>()
const loadError = ref<string>()
const chosen = ref<string[]>([...licences.value])
const status = ref<ButtonStatus>('idle')

onMounted(async () => {
  try {
    products.value = await api.products(props.orgId)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})
watch(licences, (v) => (chosen.value = [...v]))

const changed = computed(() => [...chosen.value].sort().join() !== [...licences.value].sort().join())


async function save() {
  status.value = 'loading'
  try {
    licences.value = (await api.setLicences(props.orgId, props.userId, chosen.value)).licences
    products.value = await api.products(props.orgId).catch(() => products.value)
    status.value = 'success'
    emit('saved')
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: t('licences.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card :title="t('licences.title')" :description="t('licences.cardDescription', { name })">
    <ul v-if="sources?.length" class="mb-4 flex flex-col divide-y divide-black/10" :aria-label="t('licences.sources.title')">
      <li v-for="s in sources" :key="s.product" class="flex flex-col gap-1 py-2 first:pt-0">
        <span class="text-sm font-bold">{{ s.name }}</span>
        <span v-if="s.direct" class="text-sm text-black/65">{{ t('licences.sources.direct') }}</span>
        <span v-for="g in s.groups" :key="g.id" class="text-sm text-black/65">
          <RouterLink :to="`/organisations/${orgId}/groups/${g.id}`" class="underline">{{ t('licences.sources.fromGroup', { name: g.name }) }}</RouterLink>
        </span>
        <span v-if="!s.licensed" class="text-sm text-red" role="alert">
          {{ t('licences.sources.notLicensed') }}. {{ t('licences.sources.notLicensedHelp', { name }) }}
        </span>
      </li>
    </ul>
    <EmptyState v-if="loadError" size="sm" :title="t('licences.couldntLoad')" :description="loadError" class="p-0" />
    <div v-else-if="!products" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <EmptyState v-else-if="!products.length" size="sm" :title="t('licences.none')" class="p-0" />
    <CheckboxGroup
      v-else
      v-model="chosen"
      :label="t('licences.title')"
      hide-label
      :options="products.map((p) => licenceOption(t, p, licences.includes(p.id)))"
      :disabled="!canEdit"
    />
    <template v-if="canEdit && products?.length" #footer>
      <Button
        variant="primary"
        v-model:status="status"
        :disabled="!changed && status === 'idle'"
        :loading-text="t('common.saving')"
        :success-text="t('common.saved')"
        @click="save"
      >
        {{ t('licences.save') }}
      </Button>
    </template>
  </Card>
</template>
