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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
    wordError.value = t('passwordPolicy.alreadyBanned', { word })
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
    notify({ type: 'success', title: t('passwordPolicy.saved'), description: t('passwordPolicy.savedDescription') })
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: t('passwordPolicy.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}

const preview = computed(() => rules.value.map((r) => ({ label: r.label, done: true })))
const counts = computed(() => [
  { key: 'minUppercase', label: t('passwordPolicy.counts.upper'), helper: 'A–Z' },
  { key: 'minLowercase', label: t('passwordPolicy.counts.lower'), helper: 'a–z' },
  { key: 'minDigits', label: t('passwordPolicy.counts.digits'), helper: '0–9' },
  { key: 'minSpecial', label: t('passwordPolicy.counts.special'), helper: t('passwordPolicy.counts.specialHelper') },
] as const)
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('nav.passwordPolicy')"
      :description="org ? t('passwordPolicy.description', { name: org.name }) : undefined"
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('passwordPolicy.couldntLoad')" :description="loadError" />
    </Card>
    <div v-else-if="!loaded" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Card :title="t('passwordPolicy.baseline.title')" :description="t('passwordPolicy.baseline.description')">
        <ul class="flex flex-col gap-2 text-sm">
          <li class="flex items-center gap-2">
            <Lock class="size-4 shrink-0 text-black/55" aria-hidden="true" />
            {{ t('passwordPolicy.baseline.minLength', { count: baselineMin }) }}
          </li>
          <li class="flex items-center gap-2">
            <Lock class="size-4 shrink-0 text-black/55" aria-hidden="true" />
            {{ t('passwordPolicy.baseline.common') }}
          </li>
        </ul>
      </Card>

      <Card :title="t('passwordPolicy.rules.title')" :description="t('passwordPolicy.rules.description')">
        <form id="policy-form" class="flex flex-col gap-6" novalidate @submit.prevent="save">
          <InputNumber
            v-model="policy.minLength"
            :label="t('passwordPolicy.rules.minLength')"
            :min="baselineMin"
            :max="128"
            :helper="t('passwordPolicy.rules.atLeast', { count: baselineMin })"
            class="max-w-48"
          />
          <fieldset class="flex flex-col gap-3">
            <legend class="mb-1 text-sm font-bold">{{ t('passwordPolicy.rules.mustContain') }}</legend>
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
            <!-- The button lines up with the field's box: it starts below the
                 label row (20px label + 6px gap), and an error under the field
                 doesn't move it. -->
            <div class="flex items-start gap-2">
              <Input
                v-model="newWord"
                :label="t('passwordPolicy.rules.alsoBan')"
                :error-text="wordError"
                class="flex-1"
                @keydown.enter.prevent="addWord"
              />
              <Button class="mt-6.5 shrink-0" @click="addWord">
                <template #leading><Plus /></template>
                {{ t('common.add') }}
              </Button>
            </div>
            <p class="-mt-1 text-sm text-black/65">
              {{ t('passwordPolicy.rules.banHelper') }}
            </p>
            <ul v-if="policy.blocked.length" class="flex flex-wrap gap-2" :aria-label="t('passwordPolicy.rules.banned')">
              <li v-for="word in policy.blocked" :key="word">
                <Chip removable :remove-label="t('common.removeItem', { name: word })" @remove="removeWord(word)">{{ word }}</Chip>
              </li>
            </ul>
            <p v-else class="text-sm text-black/65">{{ t('passwordPolicy.rules.noBanned') }}</p>
          </div>
        </form>
        <template #footer>
          <!-- v-model: the button sets itself back to idle a couple of
               seconds after "Saved", so the policy can be changed again. -->
          <Button type="submit" form="policy-form" variant="primary" v-model:status="status" :loading-text="t('common.saving')" :success-text="t('common.saved')">
            {{ t('passwordPolicy.save') }}
          </Button>
        </template>
      </Card>

      <Card :title="t('passwordPolicy.preview.title')" :description="t('passwordPolicy.preview.description')">
        <div class="flex flex-col gap-3">
          <Checklist :items="preview" />
          <div><Badge size="sm">{{ t('passwordPolicy.preview.extraBanned', policy.blocked.length) }}</Badge></div>
        </div>
      </Card>
    </template>
  </div>
</template>
