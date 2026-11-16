<script setup lang="ts">
import { ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Card, EmptyState, PageHeader, Spinner, Switch, type SwitchProps, useNotifications } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import MfaModeSettings from '../components/MfaModeSettings.vue'
import MfaRulesCard from '../components/MfaRulesCard.vue'
import { api, type MfaPolicy, type MfaRuleOptions } from '../lib/api'
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Security → MFA Settings: whether MFA is off, required for everyone (with a
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
  saving.value = { status: 'loading', text: t('mfa.everyoneElse.saving') }
  try {
    policy.value = await api.setMfaPolicy(orgId, { required })
    saving.value = { status: 'success', text: t('mfa.everyoneElse.saved') }
    setTimeout(() => {
      if (saving.value.status === 'success') saving.value = {}
    }, 2000)
  } catch (e) {
    saving.value = { status: 'error', text: t('mfa.everyoneElse.couldntSave') }
    notify({ type: 'error', title: t('mfa.everyoneElse.couldntSaveTitle'), description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('mfa.title')"
      :description="t('mfa.description')"
      :breadcrumb="[{ label: t('nav.security'), icon: ShieldCheck }, { label: t('mfa.title') }]"
    />

    <Card v-if="error">
      <EmptyState :icon="TriangleAlert" :title="t('mfa.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!policy || !options" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Card :title="t('mfa.mode.label')" :description="t('mfa.appliesNextSignIn')">
        <MfaModeSettings v-model:policy="policy" :org-id="orgId" />
      </Card>

      <template v-if="policy.mode === 'custom'">
        <MfaRulesCard :org-id="orgId" :options="options" />
        <Card :title="t('mfa.everyoneElse.title')" :description="t('mfa.everyoneElse.description')">
          <Switch
            :model-value="policy.required"
            :label="t('mfa.everyoneElse.label')"
            :description="t('mfa.everyoneElse.switchDescription')"
            :status="saving.status"
            :status-text="saving.text"
            @update:model-value="setEveryoneElse"
          />
        </Card>
      </template>
      <Card v-else>
        <I18nT keypath="mfa.rulesNotInUse" tag="p" scope="global" class="text-sm">
          <template #mode>
            <span class="font-bold">{{ t(policy.mode === 'off' ? 'mfa.mode.off.label' : 'mfa.requiredForEveryone') }}</span>
          </template>
        </I18nT>
      </Card>
    </template>
  </div>
</template>
