<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck } from '@lucide/vue'
import { Button, type ButtonStatus, Card, Input, Link, Progress, SummaryList, useNotifications } from '@thekestongroup/ui'
import { computed, nextTick, reactive, ref } from 'vue'
import PasswordField from '../components/PasswordField.vue'
import { ApiError, publicApi, type Organisation } from '../lib/api'
import { signIn } from '../lib/auth'

/**
 * Self-service sign-up at /create-organisation, no sign-in needed: a wizard
 * in a card centred on the page, asking for the organisation's name, its
 * domain (unique across Keston), and its first global admin (username@domain,
 * and a password meeting Keston's baseline rules). Then they sign in to
 * Keston Admin to set it up.
 */
const { notify } = useNotifications()

const steps = ['Organisation', 'Domain', 'Global admin', 'Password']
const step = ref(0)
const form = reactive({ name: '', domain: '', adminName: '', adminUsername: '', password: '' })
const errors = reactive<Record<string, string | undefined>>({})
const passwordValid = ref(false)
const status = ref<ButtonStatus>('idle')
const created = ref<Organisation>()

const domain = computed(() =>
  form.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/$/, ''),
)
const username = computed(() => form.adminUsername.trim().toLowerCase())
const last = computed(() => step.value === steps.length - 1)

function clearErrors() {
  for (const key of Object.keys(errors)) errors[key] = undefined
}

/** Checks this step before moving on. Returns whether it's fine. */
async function validate(): Promise<boolean> {
  clearErrors()
  switch (step.value) {
    case 0:
      if (!form.name.trim()) errors.name = 'Enter the organisation’s name'
      return !errors.name
    case 1: {
      if (!domain.value) {
        errors.domain = 'Enter the organisation’s domain'
        return false
      }
      // Valid, and not already another organisation's (Keston ID checks).
      const res = await publicApi.domain(domain.value)
      if (!res.valid || !res.available) errors.domain = res.message
      return !errors.domain
    }
    case 2:
      if (!form.adminName.trim()) errors.adminName = 'Enter their name'
      if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(username.value))
        errors.adminUsername = 'Use lowercase letters, numbers, dots, dashes or underscores, like j.smith'
      return !errors.adminName && !errors.adminUsername
    case 3:
      if (!passwordValid.value) errors.password = form.password ? 'The password doesn’t meet every rule yet' : 'Enter a password'
      return !errors.password
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
    notify({ type: 'error', title: 'Something went wrong', description: e instanceof Error ? e.message : String(e) })
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
    status.value = 'success'
    notify({ type: 'success', title: `${res.organisation.name} is set up`, description: `Sign in as ${res.admin.email} to finish setting it up.` })
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
  { label: 'Organisation', value: created.value?.name },
  { label: 'Domain', value: created.value?.domain },
  { label: 'Global admin', value: `${form.adminName.trim()} (${username.value}@${domain.value})` },
])
</script>

<template>
  <!-- A card in the middle of the page, both ways. -->
  <div class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4 sm:p-6">
    <div class="flex items-center gap-2 text-primary">
      <span class="flex size-8 items-center justify-center rounded bg-primary text-xs font-bold text-white" aria-hidden="true">K</span>
      <span class="text-lg font-bold">Keston</span>
    </div>
    <Card v-if="!created" class="w-full max-w-lg">
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <div class="flex flex-col gap-3">
          <Progress label="New organisation" segments :value="step + 1" :max="steps.length" />
          <p class="text-sm text-black/65">
            Step {{ step + 1 }} of {{ steps.length }}: <span class="text-black">{{ steps[step] }}</span>
          </p>
        </div>

        <div id="wizard-step" class="flex flex-col gap-4">
          <template v-if="step === 0">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">What's the organisation called?</h1>
              <p class="text-sm text-black/65">
                Set up your school or organisation on Keston. As people there would recognise it, e.g. Greenfield
                Primary School.
              </p>
            </div>
            <Input v-model="form.name" label="Organisation name" :error-text="errors.name" />
          </template>

          <template v-else-if="step === 1">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">What's its domain?</h1>
              <p class="text-sm text-black/65">
                Its users will sign in as <span class="font-bold text-black">name@{{ domain || 'domain' }}</span>. Each
                organisation needs its own.
              </p>
            </div>
            <Input
              v-model="form.domain"
              label="Domain"
              placeholder="greenfield.sch.uk"
              autocapitalize="off"
              spellcheck="false"
              :error-text="errors.domain"
            />
          </template>

          <template v-else-if="step === 2">
            <div class="flex flex-col gap-1">
              <h1 tabindex="-1" class="text-xl font-bold outline-none">Who's the first global admin?</h1>
              <p class="text-sm text-black/65">
                Probably you. They manage {{ form.name.trim() }}'s users and password policy, and can add more
                admins.
              </p>
            </div>
            <Input v-model="form.adminName" label="Their name" autocomplete="off" :error-text="errors.adminName" />
            <Input
              v-model="form.adminUsername"
              label="Username"
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
              <h1 tabindex="-1" class="text-xl font-bold outline-none">Set their password</h1>
              <p class="text-sm text-black/65">
                For {{ username }}@{{ domain }}. It can be changed later in their Keston account.
              </p>
            </div>
            <PasswordField v-model="form.password" v-model:valid="passwordValid" :username="username" public :error-text="errors.password" />
          </template>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
            <template #leading><ArrowLeft /></template>
            Previous
          </Button>
          <Link v-else as="button" class="text-sm" @click="signIn('/')">Already on Keston? Sign in</Link>
          <Button
            type="submit"
            variant="primary"
            :status="status"
            :loading-text="last ? 'Creating' : 'Checking'"
            success-text="Created"
          >
            {{ last ? 'Create organisation' : 'Next' }}
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
          <h1 tabindex="-1" class="text-xl font-bold outline-none">{{ created.name }} is set up</h1>
          <p class="text-sm text-black/65">
            Sign in as {{ username }}@{{ created.domain }} to add your people and set your password policy.
          </p>
        </div>
        <SummaryList :items="summary" />
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="primary" @click="signIn(`/organisations/${created.id}`)">Sign in to Keston Admin</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
