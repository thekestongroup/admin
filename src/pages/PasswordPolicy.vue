<script setup lang="ts">
import { Lock, Plus, TriangleAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  Checklist,
  Chip,
  EmptyState,
  Input,
  InputNumber,
  PageHeader,
  Spinner,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, type Organisation, type PasswordPolicy, type Rule } from '../lib/api'

/**
 * An organisation's password rules. Keston's baseline (8+ characters, not a
 * commonly used password) always applies; the organisation can add to it.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const rules = ref<Rule[]>([])
const baselineMin = ref(8)
const policy = reactive<PasswordPolicy>({ minLength: 8, minUppercase: 0, minLowercase: 0, minDigits: 0, minSpecial: 0, blocked: [] })
const status = ref<ButtonStatus>('idle')
const loaded = ref(false)
const loadError = ref<string>()

function apply(res: { policy: PasswordPolicy; rules: Rule[]; baselineMinLength: number }) {
  Object.assign(policy, { ...res.policy, blocked: [...(res.policy.blocked ?? [])] })
  rules.value = res.rules
  baselineMin.value = res.baselineMinLength
}

onMounted(async () => {
  try {
    const [o, res] = await Promise.all([api.organisation(orgId), api.policy(orgId)])
    org.value = o
    apply(res)
    loaded.value = true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})

// The organisation's own banned passwords.
const newWord = ref('')
const wordError = ref<string>()
function addWord() {
  const word = newWord.value.trim().toLowerCase()
  wordError.value = undefined
  if (!word) return
  if (policy.blocked.includes(word)) {
    wordError.value = `“${word}” is already on the list`
    return
  }
  policy.blocked = [...policy.blocked, word].sort()
  newWord.value = ''
}
function removeWord(word: string) {
  policy.blocked = policy.blocked.filter((w) => w !== word)
}

async function save() {
  status.value = 'loading'
  try {
    apply(await api.savePolicy(orgId, { ...policy, minLength: Math.max(policy.minLength ?? baselineMin.value, baselineMin.value) }))
    status.value = 'success'
    notify({ type: 'success', title: 'Password policy saved', description: 'New passwords must meet it. Existing ones aren’t affected until they’re changed.' })
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t save the policy', description: e instanceof Error ? e.message : String(e) })
  }
}

const preview = computed(() => rules.value.map((r) => ({ label: r.label, done: true })))
const counts = [
  { key: 'minUppercase', label: 'Capital letters', helper: 'A–Z' },
  { key: 'minLowercase', label: 'Lowercase letters', helper: 'a–z' },
  { key: 'minDigits', label: 'Numbers', helper: '0–9' },
  { key: 'minSpecial', label: 'Special characters', helper: 'Anything else, like ! ? # % or a space' },
] as const
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Password policy"
      :description="org ? `The rules for new passwords at ${org.name}.` : undefined"
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the policy" :description="loadError" />
    </Card>
    <div v-else-if="!loaded" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <Card title="Keston’s baseline" description="Set by The Keston Group for every organisation. It can’t be turned off.">
        <ul class="flex flex-col gap-2 text-sm">
          <li class="flex items-center gap-2">
            <Lock class="size-4 shrink-0 text-black/55" aria-hidden="true" />
            At least {{ baselineMin }} characters
          </li>
          <li class="flex items-center gap-2">
            <Lock class="size-4 shrink-0 text-black/55" aria-hidden="true" />
            Not a commonly used password, like “password1” or “qwerty”
          </li>
        </ul>
      </Card>

      <Card title="Your rules" description="On top of the baseline. Make them as strict as you need.">
        <form id="policy-form" class="flex flex-col gap-6" novalidate @submit.prevent="save">
          <InputNumber
            v-model="policy.minLength"
            label="Minimum length"
            :min="baselineMin"
            :max="128"
            :helper="`At least ${baselineMin}.`"
            class="max-w-48"
          />
          <fieldset class="flex flex-col gap-3">
            <legend class="mb-1 text-sm font-bold">It must contain at least</legend>
            <div class="grid gap-4 sm:grid-cols-2">
              <InputNumber
                v-for="c in counts"
                :key="c.key"
                v-model="policy[c.key]"
                :label="c.label"
                :helper="c.helper"
                :min="0"
                :max="32"
              />
            </div>
          </fieldset>

          <div class="flex flex-col gap-3">
            <div class="flex items-end gap-2">
              <Input
                v-model="newWord"
                label="Also ban these passwords"
                helper="e.g. your organisation’s name or town. Matching ignores capitals and numbers on the end."
                :error-text="wordError"
                class="flex-1"
                @keydown.enter.prevent="addWord"
              />
              <Button class="mb-6" @click="addWord">
                <template #leading><Plus /></template>
                Add
              </Button>
            </div>
            <ul v-if="policy.blocked.length" class="flex flex-wrap gap-2" aria-label="Banned passwords">
              <li v-for="word in policy.blocked" :key="word">
                <Chip removable :remove-label="`Remove ${word}`" @remove="removeWord(word)">{{ word }}</Chip>
              </li>
            </ul>
            <p v-else class="text-sm text-black/65">No extra banned passwords.</p>
          </div>
        </form>
        <template #footer>
          <Button type="submit" form="policy-form" variant="primary" :status="status" loading-text="Saving" success-text="Saved">
            Save policy
          </Button>
        </template>
      </Card>

      <Card title="What people see" description="The checklist shown when someone sets a password (as last saved).">
        <div class="flex flex-col gap-3">
          <Checklist :items="preview" />
          <div><Badge size="sm">{{ policy.blocked.length }} extra banned {{ policy.blocked.length === 1 ? 'password' : 'passwords' }}</Badge></div>
        </div>
      </Card>
    </template>
  </div>
</template>
