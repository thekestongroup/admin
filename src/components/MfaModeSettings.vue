<script setup lang="ts">
import { Card, InputNumber, Select, SettingsRow, type SelectProps } from '@thekestongroup/ui'
import { computed, reactive, ref, useId, watch } from 'vue'
import { api, type MfaMode, type MfaPolicy } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

/**
 * Multi-factor authentication, on Security → MFA Settings: Off, Require MFA
 * for everyone (with a grace period to set it up), or Custom rules (the
 * rules are below it on the page). Each change saves straight away and
 * applies at each person's next sign-in.
 */
const props = defineProps<{ orgId: string }>()
const policy = defineModel<MfaPolicy>('policy', { required: true })

const modes = computed(() =>
  (['off', 'required', 'custom'] as const).map((value) => ({
    value,
    label: t(`mfa.mode.${value}.label`),
    description: t(`mfa.mode.${value}.description`),
  })),
)
const titleId = `${useId()}-title`

type Saving = { status?: SelectProps['status']; text?: string }
const saving = reactive<{ mode: Saving; grace: Saving }>({ mode: {}, grace: {} })

async function save(key: 'mode' | 'grace', change: Parameters<typeof api.setMfaPolicy>[1]) {
  saving[key] = { status: 'loading', text: t('mfa.mode.saving') }
  try {
    policy.value = await api.setMfaPolicy(props.orgId, change)
    saving[key] = { status: 'success', text: t('mfa.mode.saved') }
    setTimeout(() => {
      if (saving[key].status === 'success') saving[key] = {}
    }, 3000)
  } catch (e) {
    saving[key] = { status: 'error', text: e instanceof Error ? e.message : t('mfa.mode.couldntSave') }
  }
}

function setMode(value: unknown) {
  const mode = value as MfaMode
  if (mode === policy.value.mode) return
  policy.value = { ...policy.value, mode }
  save('mode', { mode })
}

// The grace period: whole days, 0–90. Kept while hidden, so it comes back.
const grace = ref<number | undefined>(policy.value.gracePeriodDays)
watch(() => policy.value.gracePeriodDays, (days) => (grace.value = days))
const graceError = computed(() => {
  const v = grace.value
  if (v === undefined || v === null || Number.isNaN(v)) return t('mfa.mode.grace.enterDays')
  if (!Number.isInteger(v) || v < 0 || v > 90) return t('mfa.mode.grace.wholeDays')
  return undefined
})
let timer: ReturnType<typeof setTimeout> | undefined
function setGrace(v: number | undefined) {
  grace.value = v
  clearTimeout(timer)
  if (graceError.value || v === policy.value?.gracePeriodDays) return
  timer = setTimeout(() => save('grace', { gracePeriodDays: v }), 600)
}
</script>

<template>
  <Card :aria-labelledby="titleId" as="section">
    <!-- Title and description on the left, the dropdown on the right (it stacks on narrow screens). -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 :id="titleId" class="text-base font-bold">{{ t('mfa.mode.label') }}</h2>
        <p class="text-sm text-black/65">{{ t('mfa.appliesNextSignIn') }}</p>
      </div>
      <div class="w-full shrink-0 sm:w-80">
        <Select
          :model-value="policy.mode"
          :label="t('mfa.mode.label')"
          hide-label
          :options="modes"
          :status="saving.mode.status"
          :status-text="saving.mode.text"
          @update:model-value="setMode"
        />
      </div>
    </div>
    <p v-if="policy.mode === 'custom'" class="text-sm">{{ t('mfa.mode.customNote') }}</p>

    <!-- The grace period, for Require MFA for everyone -->
    <SettingsRow v-if="policy.mode === 'required'" :label="t('mfa.mode.grace.label')" :description="t('mfa.mode.grace.description')">
      <InputNumber
        :model-value="grace"
        :label="t('mfa.mode.grace.label')"
        hide-label
        :min="0"
        :max="90"
        :step="1"
        :format-options="{ style: 'unit', unit: 'day', unitDisplay: 'long', maximumFractionDigits: 0 }"
        :locale="locale"
        :error-text="graceError"
        :status="saving.grace.status"
        :status-text="saving.grace.text"
        @update:model-value="setGrace"
      />
    </SettingsRow>
  </Card>
</template>
