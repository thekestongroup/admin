<script setup lang="ts">
import { Button, type ButtonStatus, Card, Select, Switch, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type AppInfo } from '../lib/api'

/** Apps → "Let people request apps", and optionally which apps can be requested. */
const props = defineProps<{ orgId: string; apps: AppInfo[] }>()
const { t } = useI18n()
const { notify } = useNotifications()

const enabled = ref(true)
const excluded = ref<string[]>([])
const loaded = ref(false)
const status = ref<ButtonStatus>('idle')
const options = computed(() => props.apps.map((a) => ({ label: a.name, value: a.id })))

onMounted(async () => {
  try {
    const s = await api.appRequestSettings(props.orgId)
    enabled.value = s.enabled
    excluded.value = s.excluded
    loaded.value = true
  } catch {
    // No permission to see it, or it didn't load: the card stays hidden.
  }
})

async function save() {
  status.value = 'loading'
  try {
    const s = await api.setAppRequestSettings(props.orgId, { enabled: enabled.value, excluded: excluded.value })
    enabled.value = s.enabled
    excluded.value = s.excluded
    status.value = 'success'
    notify({ type: 'success', title: t('appRequests.settings.saved') })
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: t('appRequests.settings.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Card v-if="loaded">
    <div class="flex flex-col gap-4">
      <h2 class="text-base font-bold">{{ t('appRequests.settings.title') }}</h2>
      <Switch v-model="enabled" :label="t('appRequests.settings.enable')" :description="t('appRequests.settings.enableDescription')" />
      <Select
        v-if="enabled"
        v-model="excluded"
        :label="t('appRequests.settings.excluded')"
        :helper="t('appRequests.settings.excludedHelper')"
        :options="options"
        multiple
      />
      <div>
        <Button size="sm" :status="status" :loading-text="t('appRequests.settings.saving')" @click="save">{{ t('appRequests.settings.save') }}</Button>
      </div>
    </div>
  </Card>
</template>
