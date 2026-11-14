<script setup lang="ts">
import { Checklist, InputPassword } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { api, publicApi, type RuleResult } from '../lib/api'

/**
 * A new password, with the rules it must meet ticked off as you type. Keston
 * ID checks it (the common-password lists are there), against the
 * organisation's policy, or Keston's baseline for a new organisation.
 */
const props = withDefaults(
  defineProps<{
    label?: string
    organisationId?: string
    /** The account's username: the password can't be the same. */
    username?: string
    errorText?: string
    /** Self-service sign-up: check without signing in (baseline rules). */
    public?: boolean
  }>(),
  { label: 'Password' },
)

const password = defineModel<string>({ default: '' })
/** Whether every rule is met (checked by Keston ID). */
const valid = defineModel<boolean>('valid', { default: false })

const rules = ref<RuleResult[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let latest = 0

async function check() {
  const n = ++latest
  const result = props.public
    ? await publicApi.passwordCheck(password.value, props.username)
    : await api.passwordCheck(password.value, { organisationId: props.organisationId, username: props.username })
  if (n !== latest) return // a newer check is on its way
  rules.value = result
  valid.value = password.value !== '' && result.every((r) => r.met)
}

onMounted(check)
watch([password, () => props.username], () => {
  valid.value = false
  clearTimeout(timer)
  timer = setTimeout(check, 250)
})

const items = computed(() => rules.value.map((r) => ({ label: r.label, done: r.met })))
</script>

<template>
  <div class="flex flex-col gap-3">
    <InputPassword v-model="password" :label="label" autocomplete="new-password" :error-text="errorText" />
    <div v-if="items.length" class="flex flex-col gap-2">
      <p id="password-rules" class="text-sm font-bold">The password needs:</p>
      <Checklist :items="items" aria-labelledby="password-rules" />
    </div>
  </div>
</template>
