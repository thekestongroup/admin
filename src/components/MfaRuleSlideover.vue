<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { Button, type ButtonStatus, Chip, Input, RadioGroup, Select, Slideover } from '@thekestongroup/ui'
import { computed, reactive, ref, watch } from 'vue'
import { ApiError, api, type MfaRule, type MfaRuleOptions } from '../lib/api'

/**
 * Adding or changing an MFA custom rule: a name, what it applies to (users,
 * groups, apps, IP addresses: all that are set must match; devices are
 * coming later), and whether MFA is required then. Anything left empty
 * matches everyone and everywhere.
 */
const props = defineProps<{
  orgId: string
  options: MfaRuleOptions
  /** The rule being changed; none for a new one. */
  rule?: MfaRule
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const blank = () => ({ name: '', require: true, enabled: true, users: [] as string[], groups: [] as string[], apps: [] as string[], ipRanges: [] as string[] })
const form = reactive(blank())
const errors = reactive<Record<string, string | undefined>>({})
const status = ref<ButtonStatus>('idle')
const newRange = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, blank(), props.rule ? { ...props.rule, users: [...props.rule.users], groups: [...props.rule.groups], apps: [...props.rule.apps], ipRanges: [...props.rule.ipRanges] } : {})
  for (const k of Object.keys(errors)) errors[k] = undefined
  newRange.value = ''
  status.value = 'idle'
})

const answer = [
  { label: 'Require MFA', value: 'require', description: 'They must use MFA (and set it up if they haven’t).' },
  { label: 'Don’t require MFA', value: 'skip', description: 'They don’t need MFA here, even if the rules below would ask for it.' },
]
const answerValue = computed({
  get: () => (form.require ? 'require' : 'skip'),
  set: (v) => (form.require = v === 'require'),
})
const userOptions = computed(() => props.options.users.map((u) => ({ label: u.name, value: u.id, description: u.extra })))
const groupOptions = computed(() => props.options.groups.map((g) => ({ label: g.name, value: g.id })))
const appOptions = computed(() => props.options.apps.map((a) => ({ label: a.name, value: a.id, description: a.extra })))

// IP addresses or ranges: added one at a time, like the password policy's banned words.
function addRange() {
  const v = newRange.value.trim()
  errors.ipRanges = undefined
  if (!v) return
  if (form.ipRanges.includes(v)) {
    errors.ipRanges = `${v} is already in the list`
    return
  }
  form.ipRanges = [...form.ipRanges, v]
  newRange.value = ''
}
const removeRange = (v: string) => (form.ipRanges = form.ipRanges.filter((r) => r !== v))

async function save() {
  for (const k of Object.keys(errors)) errors[k] = undefined
  if (newRange.value.trim()) addRange()
  if (!form.name.trim()) errors.name = 'Give the rule a name'
  if (errors.name || errors.ipRanges) return
  status.value = 'loading'
  try {
    await api.saveMfaRule(props.orgId, { id: props.rule?.id, ...form, name: form.name.trim() })
    open.value = false
    emit('saved')
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else errors.name = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <Slideover
    v-model:open="open"
    :title="rule ? 'Change rule' : 'Add a rule'"
    description="When all of these match, the answer below is used. Leave one empty to match everyone, everywhere."
    initial-focus="auto"
  >
    <template #body>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
        <Input v-model="form.name" label="Name" helper="e.g. Staff away from school" autocomplete="off" :error-text="errors.name" />
        <Select
          v-model="form.users"
          label="Users"
          helper="Any of these people."
          placeholder="Anyone"
          :options="userOptions"
          :error-text="errors.users"
          multiple
          searchable
        />
        <Select
          v-model="form.groups"
          label="Groups"
          helper="Anyone in any of these groups."
          placeholder="Any group"
          :options="groupOptions"
          :error-text="errors.groups"
          multiple
          searchable
        />
        <Select
          v-model="form.apps"
          label="Apps"
          helper="When signing in to any of these apps."
          placeholder="Any app"
          :options="appOptions"
          :error-text="errors.apps"
          multiple
          searchable
        />
        <div class="flex flex-col gap-3">
          <div class="flex items-start gap-2">
            <Input
              v-model="newRange"
              label="IP addresses"
              helper="A single address or a range, e.g. 203.0.113.7 or 10.0.0.0/8. Matches when they sign in from any of them."
              autocapitalize="off"
              spellcheck="false"
              :error-text="errors.ipRanges"
              class="flex-1"
              @keydown.enter.prevent="addRange"
            />
            <Button class="mt-6.5 shrink-0" @click="addRange">
              <template #leading><Plus /></template>
              Add
            </Button>
          </div>
          <ul v-if="form.ipRanges.length" class="flex flex-wrap gap-2" aria-label="IP addresses">
            <li v-for="r in form.ipRanges" :key="r">
              <Chip removable :remove-label="`Remove ${r}`" @remove="removeRange(r)">{{ r }}</Chip>
            </li>
          </ul>
          <p v-else class="text-sm text-black/65">Any address.</p>
        </div>
        <p class="text-sm text-black/65">Devices: coming soon.</p>
        <RadioGroup v-model="answerValue" label="Then" :options="answer" />
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">Cancel</Button>
      <Button variant="primary" :status="status" loading-text="Saving" @click="save">{{ rule ? 'Save rule' : 'Add rule' }}</Button>
    </template>
  </Slideover>
</template>
