<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { Card, EmptyState, PageHeader, Spinner, Switch, type SwitchProps } from '@thekestongroup/ui'
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, type ProfileEditing } from '../lib/api'

/**
 * Organisation settings. Which profile fields people can change themselves
 * in their Keston account (admins can always change them here). Each switch
 * saves as soon as it's flipped, like Keston UI's notification settings.
 */
const route = useRoute()
const orgId = route.params.orgId as string

const editing = reactive<ProfileEditing>({ name: false, email: false, picture: false })
const loaded = ref(false)
const error = ref<string>()
const state = reactive<Record<keyof ProfileEditing, { status?: SwitchProps['status']; text?: string }>>({
  name: {},
  email: {},
  picture: {},
})

onMounted(async () => {
  try {
    Object.assign(editing, (await api.settings(orgId)).profileEditing)
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const fields: { key: keyof ProfileEditing; label: string; description: string }[] = [
  { key: 'name', label: 'Name', description: 'How they’re shown in every Keston app.' },
  { key: 'email', label: 'Email', description: 'The part before the @ (the domain stays yours). They sign in with it.' },
  { key: 'picture', label: 'Profile picture', description: 'Shown next to their name in Keston apps.' },
]

async function save(key: keyof ProfileEditing, on: boolean) {
  state[key] = { status: 'loading', text: 'Saving…' }
  try {
    Object.assign(editing, (await api.saveSettings(orgId, { ...editing, [key]: on })).profileEditing)
    state[key] = { status: 'success', text: 'Saved' }
    setTimeout(() => {
      if (state[key].status === 'success') state[key] = {}
    }, 2000)
  } catch {
    editing[key] = !on
    state[key] = { status: 'error', text: 'Couldn’t save. Try again.' }
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Settings" />
    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the settings" :description="error" />
    </Card>
    <div v-else-if="!loaded" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <Card
      v-else
      title="What people can change themselves"
      description="In their Keston account. Anything off says “Your organisation has restricted changing these”. You can always change them here."
    >
      <div class="flex flex-col gap-4">
        <Switch
          v-for="f in fields"
          :key="f.key"
          v-model="editing[f.key]"
          :label="f.label"
          :description="f.description"
          :status="state[f.key].status"
          :status-text="state[f.key].text"
          @update:model-value="save(f.key, $event)"
        />
      </div>
    </Card>
  </div>
</template>
