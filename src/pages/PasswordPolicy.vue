<script setup lang="ts">
import { ChevronDown, Eye, Lock, SlidersHorizontal, TriangleAlert } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Card,
  CardSelect,
  ChangeIndicator,
  Checklist,
  EmptyState,
  InputNumber,
  InputPassword,
  InputTextArea,
  PageHeader,
  Slideover,
  Spinner,
  UnsavedChangesBar,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type Organisation, type PasswordPolicy } from '../lib/api'
import {
  BASELINE_MIN,
  KINDS,
  MAX_COUNT,
  MAX_LENGTH,
  PRESETS,
  type PresetId,
  type PolicyRules,
  bannedPhrase,
  count,
  effectiveMinLength,
  matchPreset,
  parsePhrases,
  phraseKey,
  requiredTotal,
} from '../lib/passwordPolicy'

const { t } = useI18n()

/**
 * An organisation's password rules. Keston's baseline (8+ characters, not a
 * commonly used password) always applies; the organisation can add to it
 * with a preset, its own rules and banned phrases. Edits are kept here until
 * Save (the bar at the bottom); each edited setting shows old → new.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const org = ref<Organisation>()
const loaded = ref(false)
const loadError = ref<string>()
const baselineMin = ref(BASELINE_MIN)

/** What is saved on the server. */
const saved = ref<PasswordPolicy>({ minLength: BASELINE_MIN, minUppercase: 0, minLowercase: 0, minDigits: 0, minSpecial: 0, blocked: [] })
/** What is on screen. */
const draft = reactive<PolicyRules>({ minLength: BASELINE_MIN, minUppercase: 0, minLowercase: 0, minDigits: 0, minSpecial: 0 })
/** The banned phrases, one per line, as typed. */
const phrasesText = ref('')
const status = ref<ButtonStatus>('idle')

function apply(res: { policy: PasswordPolicy; baselineMinLength: number }) {
  saved.value = { ...res.policy, blocked: [...(res.policy.blocked ?? [])] }
  baselineMin.value = res.baselineMinLength
  discard()
}

function discard() {
  const p = saved.value
  Object.assign(draft, { minLength: p.minLength, minUppercase: p.minUppercase, minLowercase: p.minLowercase, minDigits: p.minDigits, minSpecial: p.minSpecial })
  phrasesText.value = p.blocked.join('\n')
  customPicked.value = false
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

// ── What the edited policy is ──────────────────────────────────────────────
const phrases = computed(() => parsePhrases(phrasesText.value))
/** The shortest password that can meet the rules: raised if what's required adds up to more. */
const effectiveMin = computed(() => Math.max(effectiveMinLength(draft), baselineMin.value))
const total = computed(() => requiredTotal(draft))
const raised = computed(() => total.value > (draft.minLength || 0) && total.value > baselineMin.value)

const rulesToSave = computed<PolicyRules>(() => ({
  minLength: effectiveMin.value,
  minUppercase: draft.minUppercase || 0,
  minLowercase: draft.minLowercase || 0,
  minDigits: draft.minDigits || 0,
  minSpecial: draft.minSpecial || 0,
}))

// ── Presets ────────────────────────────────────────────────────────────────
// Choosing "Custom" keeps the rules as they are and opens them. Editing a
// rule drops back to whichever preset the rules now match, or Custom.
const customPicked = ref(false)
const customOpen = ref(false)
const previewOpen = ref(false)

const selected = computed<PresetId | 'custom'>({
  get: () => (customPicked.value ? 'custom' : matchPreset(rulesToSave.value)),
  set: (value) => {
    if (value === 'custom') {
      customPicked.value = true
      customOpen.value = true
    } else {
      Object.assign(draft, PRESETS[value])
      customPicked.value = false
    }
  },
})
watch(
  () => [draft.minLength, draft.minUppercase, draft.minLowercase, draft.minDigits, draft.minSpecial],
  () => (customPicked.value = false),
)

const presetOptions = computed(() => [
  { title: t('passwordPolicy.preset.baseline.title'), value: 'baseline', description: t('passwordPolicy.preset.baseline.description', { count: baselineMin.value }) },
  { title: t('passwordPolicy.preset.recommended.title'), value: 'recommended', description: t('passwordPolicy.preset.recommended.description') },
  { title: t('passwordPolicy.preset.strict.title'), value: 'strict', description: t('passwordPolicy.preset.strict.description') },
  { title: t('passwordPolicy.preset.custom.title'), value: 'custom', description: t('passwordPolicy.preset.custom.description') },
])

/** "12+ characters, 1 number" */
function summarise(p: PolicyRules) {
  const parts = [t('passwordPolicy.summary.length', { count: p.minLength })]
  const keys = { minUppercase: 'upper', minLowercase: 'lower', minDigits: 'digits', minSpecial: 'special' } as const
  for (const k of KINDS) if (p[k] > 0) parts.push(t(`passwordPolicy.summary.${keys[k]}`, p[k]))
  return parts.join(', ')
}
const summary = computed(() => summarise(rulesToSave.value))

const kinds = computed(() => [
  { key: 'minUppercase', label: t('passwordPolicy.rules.upper'), helper: t('passwordPolicy.rules.upperHelper') },
  { key: 'minLowercase', label: t('passwordPolicy.rules.lower'), helper: t('passwordPolicy.rules.lowerHelper') },
  { key: 'minDigits', label: t('passwordPolicy.rules.digits'), helper: t('passwordPolicy.rules.digitsHelper') },
  { key: 'minSpecial', label: t('passwordPolicy.rules.special'), helper: t('passwordPolicy.rules.specialHelper') },
] as const)

// ── Unsaved changes ────────────────────────────────────────────────────────
const phrasesChanged = computed(() => phraseKey(phrases.value) !== phraseKey(saved.value.blocked))
const changed = computed(() => ({
  minLength: rulesToSave.value.minLength !== saved.value.minLength,
  minUppercase: rulesToSave.value.minUppercase !== saved.value.minUppercase,
  minLowercase: rulesToSave.value.minLowercase !== saved.value.minLowercase,
  minDigits: rulesToSave.value.minDigits !== saved.value.minDigits,
  minSpecial: rulesToSave.value.minSpecial !== saved.value.minSpecial,
  phrases: phrasesChanged.value,
}))
const dirty = computed(() => Object.values(changed.value).some(Boolean))
/** How many banned phrases there are, as the server will count them. */
const savedPhraseCount = computed(() => new Set(saved.value.blocked.map((b) => b.toLowerCase())).size)
const phraseCount = computed(() => new Set(phrases.value.map((p) => p.toLowerCase())).size)
const phraseUnit = (n: number) => t('passwordPolicy.banned.unit', n)

onBeforeRouteLeave(() => {
  if (dirty.value && status.value !== 'loading' && !window.confirm(t('passwordPolicy.unsaved.leave'))) return false
})

async function save() {
  status.value = 'loading'
  try {
    apply(await api.savePolicy(orgId, { ...rulesToSave.value, blocked: phrases.value }))
    status.value = 'idle'
    notify({ type: 'success', title: t('passwordPolicy.saved'), description: t('passwordPolicy.savedDescription') })
  } catch (e) {
    status.value = 'idle'
    notify({ type: 'error', title: t('passwordPolicy.couldntSave'), description: e instanceof Error ? e.message : String(e) })
  }
}

// ── Banned phrases ─────────────────────────────────────────────────────────
const bannedOpen = ref(false)

// ── What people see, and trying a password ─────────────────────────────────
const attempt = ref('')
const result = computed(() => {
  const c = count(attempt.value)
  const typed = attempt.value.length > 0
  const hit = bannedPhrase(attempt.value, phrases.value)
  const p = rulesToSave.value
  const items = [{ label: t('passwordPolicy.preview.length', { count: p.minLength }), done: typed && c.length >= p.minLength }]
  const keys = [
    ['minUppercase', 'upper', c.upper],
    ['minLowercase', 'lower', c.lower],
    ['minDigits', 'digits', c.digits],
    ['minSpecial', 'special', c.special],
  ] as const
  for (const [k, name, have] of keys) {
    if (p[k] > 0) items.push({ label: t(`passwordPolicy.preview.${name}`, { count: p[k] }, p[k]), done: typed && have >= p[k] })
  }
  if (phrases.value.length) items.push({ label: t('passwordPolicy.preview.noBanned'), done: typed && !hit })
  const left = items.filter((i) => !i.done).length
  return { items, hit, typed, left }
})
const outcome = computed(() => {
  const r = result.value
  if (!r.typed) return { kind: 'info', text: t('passwordPolicy.preview.empty') }
  if (r.hit) return { kind: 'no', text: t('passwordPolicy.preview.banned', { phrase: r.hit }) }
  if (r.left) return { kind: 'no', text: t('passwordPolicy.preview.toGo', { count: r.left }, r.left) }
  return { kind: 'ok', text: t('passwordPolicy.preview.accepted') }
})
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
      <Card :title="t('passwordPolicy.title')" :description="t('passwordPolicy.intro')">
        <div class="flex flex-col gap-6">
          <!-- Keston's baseline: always applies. -->
          <div class="flex items-start gap-2 text-sm text-black/65">
            <Lock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <b class="text-black">{{ t('passwordPolicy.baseline.title') }}</b>
              {{ t('passwordPolicy.baseline.description', { count: baselineMin }) }}
            </p>
          </div>

          <CardSelect v-model="selected" :label="t('passwordPolicy.preset.label')" :options="presetOptions" :columns="4" />

          <!-- Customise rules -->
          <div class="border-t border-black/15">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded py-3 text-left text-sm font-bold outline-2 outline-offset-2 outline-transparent hover:bg-black/4 focus-visible:outline-focus"
              :aria-expanded="customOpen"
              aria-controls="custom-rules"
              @click="customOpen = !customOpen"
            >
              <SlidersHorizontal class="size-4 shrink-0" aria-hidden="true" />
              {{ t('passwordPolicy.custom.title') }}
              <span class="ml-auto min-w-0 truncate text-xs font-normal text-black/65">{{ summary }}</span>
              <ChevronDown :class="['size-4 shrink-0 transition-transform motion-reduce:transition-none', customOpen && 'rotate-180']" aria-hidden="true" />
            </button>
            <div v-show="customOpen" id="custom-rules" class="flex flex-col gap-4 pb-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1 sm:col-span-2">
                  <div class="flex min-h-6 items-center gap-2 text-sm">
                    {{ t('passwordPolicy.rules.minLength') }}
                    <ChangeIndicator v-if="changed.minLength" :from="saved.minLength" :to="effectiveMin" />
                  </div>
                  <InputNumber
                    v-model="draft.minLength"
                    :label="t('passwordPolicy.rules.minLength')"
                    hide-label
                    :min="baselineMin"
                    :max="MAX_LENGTH"
                    :helper="t('passwordPolicy.rules.atLeast', { count: baselineMin })"
                  />
                </div>
                <div v-for="k in kinds" :key="k.key" class="flex flex-col gap-1">
                  <div class="flex min-h-6 items-center gap-2 text-sm">
                    {{ k.label }}
                    <ChangeIndicator v-if="changed[k.key]" :from="saved[k.key]" :to="draft[k.key] || 0" />
                  </div>
                  <InputNumber v-model="draft[k.key]" :label="k.label" hide-label :helper="k.helper" :min="0" :max="MAX_COUNT" />
                </div>
              </div>
              <p v-if="raised" role="status" class="text-sm text-black/65">
                {{ t('passwordPolicy.rules.addUp', { total }) }}
              </p>
            </div>
          </div>

          <!-- Banned phrases -->
          <div class="flex flex-wrap items-start justify-between gap-3 border-t border-black/15 pt-4">
            <div class="flex min-w-0 flex-1 basis-64 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                {{ t('passwordPolicy.banned.title') }}
                <ChangeIndicator v-if="changed.phrases" :from="savedPhraseCount" :to="phraseCount" :unit="phraseUnit(phraseCount)" />
              </div>
              <p class="text-xs text-black/65">{{ t('passwordPolicy.banned.description') }}</p>
              <p class="text-xs text-black/65">{{ phraseCount ? t('passwordPolicy.banned.count', { count: phraseCount }, phraseCount) : t('passwordPolicy.banned.none') }}</p>
            </div>
            <Button @click="bannedOpen = true">{{ phraseCount ? t('passwordPolicy.banned.manage') : t('passwordPolicy.banned.add') }}</Button>
          </div>

          <!-- What people see, and try a password -->
          <div class="border-t border-black/15">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded py-3 text-left text-sm font-bold outline-2 outline-offset-2 outline-transparent hover:bg-black/4 focus-visible:outline-focus"
              :aria-expanded="previewOpen"
              aria-controls="policy-preview"
              @click="previewOpen = !previewOpen"
            >
              <Eye class="size-4 shrink-0" aria-hidden="true" />
              {{ t('passwordPolicy.preview.title') }}
              <ChevronDown :class="['ml-auto size-4 shrink-0 transition-transform motion-reduce:transition-none', previewOpen && 'rotate-180']" aria-hidden="true" />
            </button>
            <div v-show="previewOpen" id="policy-preview" class="flex flex-col gap-4 pb-2">
              <Checklist :items="result.items" :aria-label="t('passwordPolicy.preview.checklist')" />
              <InputPassword
                v-model="attempt"
                :label="t('passwordPolicy.preview.try')"
                :helper="t('passwordPolicy.preview.tryHelper')"
                autocomplete="off"
                spellcheck="false"
                autocapitalize="off"
              />
              <p
                role="status"
                :class="['text-sm', outcome.kind === 'ok' && 'font-bold text-green', outcome.kind === 'no' && 'font-bold text-red', outcome.kind === 'info' && 'text-black/65']"
              >
                {{ outcome.text }}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <!-- Banned phrases: one per line -->
      <Slideover
        v-model:open="bannedOpen"
        :title="t('passwordPolicy.banned.title')"
        :description="t('passwordPolicy.banned.slideoverDescription')"
        initial-focus="auto"
      >
        <template #body>
          <InputTextArea
            v-model="phrasesText"
            :label="t('passwordPolicy.banned.title')"
            :helper="t('passwordPolicy.banned.description')"
            :placeholder="t('passwordPolicy.banned.placeholder')"
            autocapitalize="off"
            spellcheck="false"
            class="[&_textarea]:min-h-64"
          />
          <p class="mt-4 text-xs text-black/65" role="status">
            {{ t('passwordPolicy.banned.count', { count: phraseCount }, phraseCount) }}
          </p>
        </template>
        <template #footer="{ close }">
          <Button variant="primary" @click="close">{{ t('passwordPolicy.banned.done') }}</Button>
        </template>
      </Slideover>

      <!-- Last in the page: it leaves a gap its own height, so nothing is covered. -->
      <UnsavedChangesBar :open="dirty" :status="status" class="lg:left-64" @discard="discard" @save="save" />
    </template>
  </div>
</template>
