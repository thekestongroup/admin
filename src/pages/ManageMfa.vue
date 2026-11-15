<script setup lang="ts">
import { ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Card, EmptyState, PageHeader, Spinner, Switch, type SwitchProps, useNotifications } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import MfaRulesCard from '../components/MfaRulesCard.vue'
import MfaSettings from '../components/MfaSettings.vue'
import { api, type MfaPolicy, type MfaRuleOptions } from '../lib/api'

/**
 * Security → Manage MFA: whether MFA is off, required for everyone (with a
 * grace period), or decided by custom rules (users, groups, apps and IP
 * addresses; devices later). Changes apply at each person's next sign-in.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const policy = ref<MfaPolicy>()
const options = ref<MfaRuleOptions>()
const error = ref<string>()
onMounted(async () => {
  try {
    ;[policy.value, options.value] = await Promise.all([api.mfaPolicy(orgId), api.mfaRuleOptions(orgId)])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

// "Everyone else": for anyone no rule matches.
const saving = ref<{ status?: SwitchProps['status']; text?: string }>({})
async function setEveryoneElse(required: boolean) {
  saving.value = { status: 'loading', text: 'Saving…' }
  try {
    policy.value = await api.setMfaPolicy(orgId, { required })
    saving.value = { status: 'success', text: 'Saved' }
    setTimeout(() => {
      if (saving.value.status === 'success') saving.value = {}
    }, 2000)
  } catch (e) {
    saving.value = { status: 'error', text: 'Couldn’t save. Try again.' }
    notify({ type: 'error', title: 'Couldn’t save', description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Manage MFA"
      description="Whether people need multi-factor authentication (MFA) to sign in, and when."
      :breadcrumb="[{ label: 'Security', icon: ShieldCheck }, { label: 'Manage MFA' }]"
    />

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the MFA settings" :description="error" />
    </Card>
    <div v-else-if="!policy || !options" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Card title="Multi-factor authentication" description="Changes apply at each person’s next sign-in.">
        <MfaSettings v-model:policy="policy" :org-id="orgId" />
      </Card>

      <template v-if="policy.mode === 'custom'">
        <MfaRulesCard :org-id="orgId" :options="options" />
        <Card title="Everyone else" description="For anyone no rule above matches, including new users.">
          <Switch
            :model-value="policy.required"
            label="Require MFA"
            description="They set it up when they next sign in, before they can use any app."
            :status="saving.status"
            :status-text="saving.text"
            @update:model-value="setEveryoneElse"
          />
        </Card>
      </template>
      <Card v-else>
        <p class="text-sm">
          Custom rules aren’t in use: multi-factor authentication is set to
          <span class="font-bold">{{ policy.mode === 'off' ? 'Off' : 'Require MFA for everyone' }}</span>. Choose Custom
          rules above to set rules by users, groups, apps and IP addresses.
        </p>
      </Card>
    </template>
  </div>
</template>
