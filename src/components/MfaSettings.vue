<script setup lang="ts">
import { InputNumber, Select, type SelectProps } from '@thekestongroup/ui'
import { computed, reactive, ref, useId, watch } from 'vue'
import { api, type MfaMode, type MfaPolicy } from '../lib/api'

/**
 * Multi-factor authentication, on Security → Manage MFA: Off, Require MFA
 * for everyone (with a grace period to set it up), or Custom rules (the
 * rules are below it on the page). Each change saves straight away and
 * applies at each person's next sign-in.
 */
const props = defineProps<{ orgId: string }>()
const policy = defineModel<MfaPolicy>('policy', { required: true })

const modes: { label: string; value: MfaMode; description: string }[] = [
  { label: 'Off', value: 'off', description: 'Not recommended. Users aren’t required to set up MFA.' },
  {
    label: 'Require MFA',
    value: 'required',
    description: 'Recommended for security. All users must verify with a second factor when they sign in.',
  },
  { label: 'Custom rules', value: 'custom', description: 'For advanced MFA configuration, such as rules by group, app or network.' },
]
const modeDescription = computed(() => modes.find((m) => m.value === policy.value?.mode)?.description)

type Saving = { status?: SelectProps['status']; text?: string }
const saving = reactive<{ mode: Saving; grace: Saving }>({ mode: {}, grace: {} })

async function save(key: 'mode' | 'grace', change: Parameters<typeof api.setMfaPolicy>[1]) {
  saving[key] = { status: 'loading', text: 'Saving…' }
  try {
    policy.value = await api.setMfaPolicy(props.orgId, change)
    saving[key] = { status: 'success', text: 'Saved. Applies at each person’s next sign-in.' }
    setTimeout(() => {
      if (saving[key].status === 'success') saving[key] = {}
    }, 3000)
  } catch (e) {
    saving[key] = { status: 'error', text: e instanceof Error ? e.message : 'Couldn’t save. Try again.' }
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
  if (v === undefined || v === null || Number.isNaN(v)) return 'Enter a number of days'
  if (!Number.isInteger(v) || v < 0 || v > 90) return 'Enter a whole number of days from 0 to 90'
  return undefined
})
let timer: ReturnType<typeof setTimeout> | undefined
function setGrace(v: number | undefined) {
  grace.value = v
  clearTimeout(timer)
  if (graceError.value || v === policy.value?.gracePeriodDays) return
  timer = setTimeout(() => save('grace', { gracePeriodDays: v }), 600)
}

const modeLabelId = useId()
const modeDescriptionId = useId()
const graceLabelId = useId()
const graceDescriptionId = useId()
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Multi-factor authentication -->
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div class="flex min-w-0 flex-col gap-0.5">
          <p :id="modeLabelId" class="text-sm" aria-hidden="true">Multi-factor authentication</p>
          <p :id="modeDescriptionId" class="text-xs text-black/65" aria-live="polite">{{ modeDescription }}</p>
        </div>
        <Select
          :model-value="policy.mode"
          label="Multi-factor authentication"
          :options="modes"
          :status="saving.mode.status"
          :status-text="saving.mode.text"
          :aria-describedby="modeDescriptionId"
          class="w-full shrink-0 sm:w-80 [&_label]:sr-only"
          @update:model-value="setMode"
        />
      </div>
      <p v-if="policy.mode === 'custom'" class="text-sm">MFA is managed by custom rules, below.</p>
    </div>

    <!-- The grace period, for Require MFA for everyone -->
    <div
      v-if="policy.mode === 'required'"
      class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <p :id="graceLabelId" class="text-sm" aria-hidden="true">MFA enrolment grace period</p>
        <p :id="graceDescriptionId" class="text-xs text-black/65">
          Users will have the following number of days to enrol in MFA before it’s enforced at their next login.
          0 means it’s enforced at their next login.
        </p>
      </div>
      <InputNumber
        :model-value="grace"
        label="MFA enrolment grace period"
        :min="0"
        :max="90"
        :step="1"
        :format-options="{ style: 'unit', unit: 'day', unitDisplay: 'long', maximumFractionDigits: 0 }"
        locale="en-GB"
        :error-text="graceError"
        :status="saving.grace.status"
        :status-text="saving.grace.text"
        :aria-describedby="graceDescriptionId"
        class="w-full shrink-0 sm:w-80 [&_label]:sr-only"
        @update:model-value="setGrace"
      />
    </div>
  </div>
</template>
