<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import {
  Card,
  EmptyState,
  Link,
  PageHeader,
  Select,
  type SelectProps,
  Spinner,
  Switch,
  useNotifications,
} from '@thekestongroup/ui'
import { onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { api, type MfaPolicy } from '../lib/api'

/**
 * MFA's custom rules (used when Settings → Multi-factor authentication is
 * "Custom rules"): a default for everyone, overridden per group. If
 * any of someone's groups requires it, it's required; otherwise a group
 * that doesn't require it wins over the default. People who must use it but
 * don't have it yet set it up when they next sign in. Each change saves
 * straight away.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const policy = ref<MfaPolicy>()
const error = ref<string>()
type Saving = { status?: SelectProps['status']; text?: string }
const saving = reactive<Record<string, Saving>>({})
const DEFAULT = 'default'

onMounted(async () => {
  try {
    policy.value = await api.mfaPolicy(orgId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

async function save(key: string, change: () => Promise<MfaPolicy>) {
  saving[key] = { status: 'loading', text: 'Saving…' }
  try {
    policy.value = await change()
    saving[key] = { status: 'success', text: 'Saved' }
    setTimeout(() => {
      if (saving[key]?.status === 'success') saving[key] = {}
    }, 2000)
  } catch (e) {
    saving[key] = { status: 'error', text: 'Couldn’t save. Try again.' }
    notify({ type: 'error', title: 'Couldn’t save', description: e instanceof Error ? e.message : String(e) })
  }
}

const setDefault = (required: boolean) => save(DEFAULT, () => api.setMfaRequired(orgId, required))

function groupOptions() {
  return [
    { label: `Same as everyone else (${policy.value?.required ? 'required' : 'not required'})`, value: DEFAULT },
    { label: 'Required', value: 'required', description: 'Wins if their groups disagree' },
    { label: 'Not required', value: 'not-required' },
  ]
}
const groupValue = (required: boolean | null) => (required === null ? DEFAULT : required ? 'required' : 'not-required')
function setGroup(groupId: string, value: string) {
  const required = value === DEFAULT ? null : value === 'required'
  save(groupId, () => api.setGroupMfaRequired(orgId, groupId, required))
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader title="Security" description="Custom rules for who must use multi-factor authentication (MFA) to sign in." />

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the security settings" :description="error" />
    </Card>
    <div v-else-if="!policy" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Card v-if="policy.mode !== 'custom'">
        <p class="text-sm">
          These rules aren’t in use: multi-factor authentication is set to
          <span class="font-bold">{{ policy.mode === 'off' ? 'Off' : 'Require MFA for everyone' }}</span>.
          To use them, choose Custom rules in
          <Link :as="RouterLink" :to="`/organisations/${orgId}/settings`">Settings</Link>.
        </p>
      </Card>
      <Card title="Everyone else" description="For everyone not covered by a group’s rule, including new users.">
        <Switch
          :model-value="policy.required"
          label="Require MFA"
          description="Users without MFA set it up when they next sign in, before they can use any app."
          :status="saving[DEFAULT]?.status"
          :status-text="saving[DEFAULT]?.text"
          @update:model-value="setDefault"
        />
      </Card>

      <Card title="Group rules" description="Overrides Everyone else for a group’s users. If someone’s groups disagree, Required wins.">
        <p v-if="!policy.groups.length" class="text-sm text-black/65">
          No groups yet. <Link :as="RouterLink" :to="`/organisations/${orgId}/groups`">Manage groups</Link>
        </p>
        <div v-else class="flex flex-col gap-4">
          <Select
            v-for="g in policy.groups"
            :key="g.id"
            :model-value="groupValue(g.required)"
            :label="g.name"
            :helper="g.memberCount === 1 ? '1 user' : `${g.memberCount} users`"
            :options="groupOptions()"
            :status="saving[g.id]?.status"
            :status-text="saving[g.id]?.text"
            @update:model-value="setGroup(g.id, String($event ?? DEFAULT))"
          />
        </div>
      </Card>
    </template>
  </div>
</template>
