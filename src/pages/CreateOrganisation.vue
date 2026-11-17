<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck } from '@lucide/vue'
import { Button, type ButtonStatus, Card, Input, Link, Steps, SummaryList, useNotifications } from '@thekestongroup/ui'
import { computed, nextTick, reactive, ref } from 'vue'
import PasswordField from '../components/PasswordField.vue'
import { ApiError, publicApi, type Organisation } from '../lib/api'
import { signIn } from '../lib/auth'
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Self-service sign-up at /create-organisation, no sign-in needed: a wizard
 * in a card centred on the page, asking for the organisation's name, its
 * domain (unique across Keston), and its first global admin (username@domain,
 * and a password meeting Keston's baseline rules). Then they sign in to
 * Keston Admin to set it up.
 */
const { notify } = useNotifications()

const steps = computed(() => [t('createOrg.steps.organisation'), t('createOrg.steps.domain'), t('createOrg.steps.globalAdmin'), t('createOrg.steps.password')])
const step = ref(0)
const form = reactive({ name: '', domain: '', adminName: '', adminUsername: '', password: '' })
const errors = reactive<Record<string, string | undefined>>({})
const passwordValid = ref(false)
const passwordInvalid = ref(false)
const status = ref<ButtonStatus>('idle')
const created = ref<Organisation>()
/** Keston staff have to verify it before anyone can sign in. */
const awaiting = ref(false)

const domain = computed(() =>
  form.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/$/, ''),
)
const username = computed(() => form.adminUsername.trim().toLowerCase())
const last = computed(() => step.value === steps.value.length - 1)

function clearErrors() {
  for (const key of Object.keys(errors)) errors[key] = undefined
}

/** Checks this step before moving on. Returns whether it's fine. */
async function validate(): Promise<boolean> {
  clearErrors()
  switch (step.value) {
    case 0:
      if (!form.name.trim()) errors.name = t('createOrg.errors.name')
      return !errors.name
    case 1: {
      if (!domain.value) {
        errors.domain = t('createOrg.errors.domain')
        return false
      }
      // Valid, and not already another organisation's (Keston ID checks).
      const res = await publicApi.domain(domain.value)
      if (!res.valid || !res.available) errors.domain = res.message
      return !errors.domain
    }
    case 2:
      if (!form.adminName.trim()) errors.adminName = t('createOrg.errors.adminName')
      if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(username.value))
        errors.adminUsername = t('addUser.errors.username')
      return !errors.adminName && !errors.adminUsername
    case 3:
      passwordInvalid.value = !passwordValid.value
      return !passwordInvalid.value
  }
  return true
}

async function focusStep() {
  await nextTick()
  document.querySelector<HTMLElement>('#wizard-step input')?.focus()
}

async function next() {
  if (status.value !== 'idle') return
  status.value = 'loading'
  try {
    if (!(await validate())) return
    if (last.value) return await create()
    step.value++
    focusStep()
  } catch (e) {
    notify({ type: 'error', title: t('createOrg.somethingWrong'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    if (status.value === 'loading') status.value = 'idle'
  }
}

function previous() {
  clearErrors()
  step.value--
  focusStep()
}

// Which step each server field error belongs to.
const fieldStep: Record<string, number> = { name: 0, domain: 1, adminName: 2, adminUsername: 2, adminPassword: 3 }

async function create() {
  try {
    const res = await publicApi.createOrganisation({
      name: form.name.trim(),
      domain: domain.value,
      adminName: form.adminName.trim(),
      adminUsername: username.value,
      adminPassword: form.password,
    })
    created.value = res.organisation
    awaiting.value = res.awaitingVerification
    status.value = 'success'
    if (!awaiting.value)
      notify({ type: 'success', title: t('createOrg.isSetUp', { name: res.organisation.name }), description: t('createOrg.signInAs', { email: res.admin.email }) })
    await nextTick()
    document.querySelector<HTMLElement>('#wizard-done h1')?.focus()
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field && e.field in fieldStep) {
      step.value = fieldStep[e.field]
      errors[e.field === 'adminPassword' ? 'password' : e.field] = e.message
      return
    }
    throw e
  }
}

const summary = computed(() => [
  { label: t('createOrg.steps.organisation'), value: created.value?.name },
  { label: t('createOrg.steps.domain'), value: created.value?.domain },
  { label: t('createOrg.steps.globalAdmin'), value: `${form.adminName.trim()} (${username.value}@${domain.value})` },
])
</script>

<template>
  <!-- A card in the middle of the page, both ways. -->
  <div class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4 sm:p-6">
    <div class="flex items-center gap-2 text-primary">
      <span class="flex size-8 items-center justify-center rounded bg-primary text-xs font-bold text-white" aria-hidden="true">K</span>
      <span class="text-lg font-bold">{{ t('createOrg.keston') }}</span>
    </div>
    <Card v-if="!created" class="w-full max-w-lg">
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <Steps :steps="steps" :step="step" :label="t('createOrg.newOrganisation')" />

        <div id="wizard-step" class="flex flex-col gap-4">
          <template v-if="step === 0">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.name.title') }}</h1>
              <p class="text-sm text-black/65">{{ t('createOrg.name.description') }}</p>
            </div>
            <Input v-model="form.name" :label="t('createOrg.name.label')" :error-text="errors.name" />
          </template>

          <template v-else-if="step === 1">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.domain.title') }}</h1>
              <I18nT keypath="createOrg.domain.description" tag="p" scope="global" class="text-sm text-black/65">
                <template #email><span class="font-bold text-black">john.doe@{{ domain || t('createOrg.domain.fallback') }}</span></template>
              </I18nT>
            </div>
            <Input
              v-model="form.domain"
              :label="t('organisations.columns.domain')"
              :placeholder="t('createOrg.domain.placeholder')"
              autocapitalize="off"
              spellcheck="false"
              :error-text="errors.domain"
            />
          </template>

          <template v-else-if="step === 2">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.admin.title') }}</h1>
              <p class="text-sm text-black/65">{{ t('createOrg.admin.description', { name: form.name.trim() }) }}</p>
            </div>
            <Input v-model="form.adminName" :label="t('createOrg.admin.theirName')" autocomplete="off" :error-text="errors.adminName" />
            <Input
              v-model="form.adminUsername"
              :label="t('addUser.username')"
              autocapitalize="off"
              spellcheck="false"
              autocomplete="off"
              :error-text="errors.adminUsername"
            >
              <template #trailing><span class="text-sm text-black/65">@{{ domain }}</span></template>
            </Input>
          </template>

          <template v-else>
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.password.title') }}</h1>
              <p class="text-sm text-black/65">{{ t('createOrg.password.description', { email: `${username}@${domain}` }) }}</p>
            </div>
            <PasswordField v-model="form.password" v-model:valid="passwordValid" v-model:invalid="passwordInvalid" :username="username" public :error-text="errors.password" />
          </template>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
            <template #leading><ArrowLeft /></template>
            {{ t('common.previous') }}
          </Button>
          <Link v-else as="button" class="text-sm" @click="signIn('/')">{{ t('createOrg.alreadyOnKeston') }}</Link>
          <Button
            type="submit"
            variant="primary"
            :status="status"
            :loading-text="last ? t('groups.creating') : t('createOrg.checking')"
            :success-text="t('createOrg.created')"
          >
            {{ last ? t('createOrg.create') : t('common.next') }}
            <template v-if="!last" #trailing><ArrowRight /></template>
          </Button>
        </div>
      </form>
    </Card>

    <!-- Done. -->
    <Card v-else id="wizard-done" class="w-full max-w-lg">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <CircleCheck class="size-10 text-green" aria-hidden="true" />
          <template v-if="awaiting">
            <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.thanks') }}</h1>
            <p class="text-sm text-black/65">{{ t('createOrg.awaitingVerification', { name: created.name }) }}</p>
          </template>
          <template v-else>
            <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ t('createOrg.isSetUp', { name: created.name }) }}</h1>
            <p class="text-sm text-black/65">{{ t('createOrg.done', { email: `${username}@${created.domain}` }) }}</p>
          </template>
        </div>
        <SummaryList :items="summary" />
        <div v-if="!awaiting" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="primary" @click="signIn(`/organisations/${created.id}`)">{{ t('createOrg.signInToAdmin') }}</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
