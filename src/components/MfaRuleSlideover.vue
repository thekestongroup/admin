<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { Button, type ButtonStatus, Chip, Input, RadioGroup, Select, Slideover } from '@thekestongroup/ui'
import { computed, reactive, ref, watch } from 'vue'
import { ApiError, api, type MfaRule, type MfaRuleOptions } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

const answer = computed(() => [
  { label: t('mfa.rule.requireLabel'), value: 'require', description: t('mfa.rule.requireDescription') },
  { label: t('mfa.rule.skipLabel'), value: 'skip', description: t('mfa.rule.skipDescription') },
])
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
    errors.ipRanges = t('mfa.rule.alreadyListed', { value: v })
    return
  }
  form.ipRanges = [...form.ipRanges, v]
  newRange.value = ''
}
const removeRange = (v: string) => (form.ipRanges = form.ipRanges.filter((r) => r !== v))

async function save() {
  for (const k of Object.keys(errors)) errors[k] = undefined
  if (newRange.value.trim()) addRange()
  if (!form.name.trim()) errors.name = t('mfa.rule.nameRequired')
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
    :title="rule ? t('mfa.rule.changeTitle') : t('mfa.rule.addTitle')"
    :description="t('mfa.rule.description')"
    initial-focus="auto"
  >
    <template #body>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
        <Input v-model="form.name" :label="t('mfa.rule.name')" :helper="t('mfa.rule.nameHelper')" autocomplete="off" :error-text="errors.name" />
        <Select
          v-model="form.users"
          :label="t('mfa.rule.users')"
          :helper="t('mfa.rule.usersHelper')"
          :placeholder="t('mfa.rule.anyone')"
          :options="userOptions"
          :error-text="errors.users"
          multiple
          searchable
        />
        <Select
          v-model="form.groups"
          :label="t('mfa.rule.groups')"
          :helper="t('mfa.rule.groupsHelper')"
          :placeholder="t('mfa.rule.anyGroup')"
          :options="groupOptions"
          :error-text="errors.groups"
          multiple
          searchable
        />
        <Select
          v-model="form.apps"
          :label="t('mfa.rule.apps')"
          :helper="t('mfa.rule.appsHelper')"
          :placeholder="t('mfa.rule.anyApp')"
          :options="appOptions"
          :error-text="errors.apps"
          multiple
          searchable
        />
        <div class="flex flex-col gap-3">
          <div class="flex items-start gap-2">
            <Input
              v-model="newRange"
              :label="t('mfa.rule.ipAddresses')"
              :helper="t('mfa.rule.ipHelper')"
              autocapitalize="off"
              spellcheck="false"
              :error-text="errors.ipRanges"
              class="flex-1"
              @keydown.enter.prevent="addRange"
            />
            <Button class="mt-6.5 shrink-0" @click="addRange">
              <template #leading><Plus /></template>
              {{ t('common.add') }}
            </Button>
          </div>
          <ul v-if="form.ipRanges.length" class="flex flex-wrap gap-2" :aria-label="t('mfa.rule.ipAddresses')">
            <li v-for="r in form.ipRanges" :key="r">
              <Chip removable :remove-label="t('common.removeItem', { name: r })" @remove="removeRange(r)">{{ r }}</Chip>
            </li>
          </ul>
          <p v-else class="text-sm text-black/65">{{ t('mfa.rule.anyAddress') }}</p>
        </div>
        <p class="text-sm text-black/65">{{ t('mfa.rule.devicesSoon') }}</p>
        <RadioGroup v-model="answerValue" :label="t('mfa.rule.then')" :options="answer" />
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
      <Button variant="primary" :status="status" :loading-text="t('common.saving')" @click="save">{{ rule ? t('mfa.rule.save') : t('mfa.rule.add') }}</Button>
    </template>
  </Slideover>
</template>
