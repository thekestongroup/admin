<script setup lang="ts">
import { Ticket } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  RadioGroup,
  Select,
  Slideover,
  Spinner,
  formatDateTime,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { api, type AccessPass, type SignInState, type User } from '../lib/api'

/**
 * On a user's page: what they must do when they next sign in (choose a new
 * password, set up MFA), and temporary access passes, which sign them in
 * without their password or MFA (e.g. after losing their phone). A pass's
 * code is shown once, when it's issued.
 */
const props = defineProps<{
  orgId: string
  user: User
  /** Reset passwords, and you can change them. */
  canRequirePassword: boolean
  /** Issue access passes, and you can change them. */
  canIssuePasses: boolean
}>()
const { notify } = useNotifications()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const state = ref<SignInState>()
const error = ref<string>()

async function reload() {
  try {
    state.value = await api.signInState(props.orgId, props.user.id)
    error.value = undefined
  } catch (e) {
    error.value = message(e)
  }
}
onMounted(reload)


// ── Require a password change ───────────────────────────────────────────────

const pwStatus = ref<ButtonStatus>('idle')
async function setPasswordChange(required: boolean) {
  pwStatus.value = 'loading'
  try {
    await api.requirePasswordChange(props.orgId, props.user.id, required)
    await reload()
    notify({
      type: 'success',
      title: required ? 'Password change required' : 'Password change no longer required',
      description: required ? `${props.user.name} will choose a new password when they next sign in.` : undefined,
    })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t change that', description: message(e) })
  } finally {
    pwStatus.value = 'idle'
  }
}

// ── Access passes ───────────────────────────────────────────────────────────

function passStatus(p: AccessPass): { label: string; color: 'green' | 'basic' } {
  if (p.active) return { label: 'Active', color: 'green' }
  if (p.revokedAt) return { label: 'Revoked', color: 'basic' }
  if (p.oneTime && p.lastUsedAt) return { label: 'Used', color: 'basic' }
  return { label: 'Expired', color: 'basic' }
}

function passDetail(p: AccessPass) {
  const kind = p.oneTime ? 'One-time' : 'Time-limited'
  const until = p.active ? `, until ${formatDateTime(p.expiresAt)}` : ''
  const by = p.createdBy ? ` · Issued by ${p.createdBy}` : ''
  return `${kind}${until}${by}`
}

const issuing = ref(false)
const kinds = [
  { label: 'One-time', value: 'one-time', description: 'Works once, within the time below.' },
  { label: 'Time-limited', value: 'time-limited', description: 'Works as often as needed until it expires.' },
]
const hourOptions = Array.from({ length: 8 }, (_, i) => ({ label: i === 0 ? '1 hour' : `${i + 1} hours`, value: String(i + 1) }))
const form = ref({ kind: 'one-time', hours: '1', requirePasswordChange: false })
const issueStatus = ref<ButtonStatus>('idle')
/** The new pass's code: shown once. */
const code = ref<string>()

function startIssue() {
  form.value = { kind: 'one-time', hours: '1', requirePasswordChange: false }
  code.value = undefined
  issueStatus.value = 'idle'
  issuing.value = true
}

// For the page's toolbar.
defineExpose({
  reload,
  setPasswordChange,
  startIssue,
  passwordChangeRequired: computed(() => !!state.value?.passwordChangeRequired),
})

async function issue() {
  issueStatus.value = 'loading'
  try {
    const res = await api.createAccessPass(props.orgId, props.user.id, {
      hours: Number(form.value.hours),
      oneTime: form.value.kind === 'one-time',
      requirePasswordChange: form.value.requirePasswordChange,
    })
    code.value = res.code
    issueStatus.value = 'idle'
    await reload()
  } catch (e) {
    issueStatus.value = 'idle'
    notify({ type: 'error', title: 'Couldn’t issue an access pass', description: message(e) })
  }
}

const revoking = ref<string>()
async function revoke(p: AccessPass) {
  revoking.value = p.id
  try {
    await api.revokeAccessPass(props.orgId, props.user.id, p.id)
    await reload()
    notify({ type: 'success', title: 'Access pass revoked', description: 'It no longer signs them in.' })
  } catch (e) {
    notify({ type: 'error', title: 'Couldn’t revoke the access pass', description: message(e) })
  } finally {
    revoking.value = undefined
  }
}
</script>

<template>
  <Card title="Signing in" description="What they must do when they next sign in, and access passes.">
    <p v-if="error" class="text-sm text-red" role="alert">{{ error }}</p>
    <div v-else-if="!state" class="flex justify-center py-6"><Spinner label="Loading" /></div>
    <div v-else class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <p class="flex-1 text-sm font-bold">New password at next sign-in</p>
          <Badge v-if="state.passwordChangeRequired" color="yellow">Required</Badge>
          <Badge v-else>Not required</Badge>
        </div>
        <p class="text-sm text-black/65">
          <template v-if="state.passwordChangeRequired">
            When they next sign in, they’ll choose a new password before they can continue.
          </template>
          <template v-else>They sign in with their current password.</template>
        </p>
        <div v-if="canRequirePassword">
          <Button
            v-if="state.passwordChangeRequired"
            :status="pwStatus"
            loading-text="Saving"
            @click="setPasswordChange(false)"
          >
            Don’t require a password change
          </Button>
          <Button v-else :status="pwStatus" loading-text="Saving" @click="setPasswordChange(true)">
            Require password change
          </Button>
        </div>
      </div>

      <div v-if="state.mfaRequired" class="flex flex-col gap-1">
        <p class="text-sm font-bold">MFA is required for them</p>
        <p class="text-sm text-black/65">
          <template v-if="user.mfa">They use it every time they sign in.</template>
          <template v-else>They don’t have it yet, so they’ll set it up when they next sign in.</template>
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <p class="flex-1 text-sm font-bold">Access passes</p>
          <Button v-if="canIssuePasses && user.status === 'active'" size="sm" @click="startIssue">
            <template #leading><Ticket /></template>
            Issue access pass
          </Button>
        </div>
        <p class="text-sm text-black/65">
          A temporary code that signs them in instead of their password and MFA, e.g. after losing their phone. They
          then set up MFA again.
        </p>
        <ul v-if="state.accessPasses.length" class="flex flex-col divide-y divide-black/10">
          <li v-for="p in state.accessPasses" :key="p.id" class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm">Issued {{ formatDateTime(p.createdAt) }}</span>
              <span class="text-xs text-black/65">{{ passDetail(p) }}</span>
            </span>
            <Badge size="sm" :color="passStatus(p).color">{{ passStatus(p).label }}</Badge>
            <Button
              v-if="p.active && canIssuePasses"
              size="sm"
              variant="ghost"
              :status="revoking === p.id ? 'loading' : 'idle'"
              loading-text="Revoking"
              @click="revoke(p)"
            >
              Revoke
            </Button>
          </li>
        </ul>
        <p v-else class="text-sm text-black/65">None in the last week.</p>
      </div>
    </div>
  </Card>

  <Slideover
    v-model:open="issuing"
    :title="code ? 'Give them this access pass' : `Issue an access pass for ${user.name}`"
    :description="
      code
        ? 'You won’t see it again. Give it to them securely, e.g. in person or on the phone, never by email.'
        : 'Only issue one once you’re sure it’s really them asking.'
    "
  >
    <template #body>
      <div v-if="code" class="flex flex-col gap-4">
        <p class="rounded bg-surface px-3 py-4 text-center font-mono text-xl font-bold tracking-wide select-all">
          {{ code }}
        </p>
        <p class="text-sm">
          They choose <span class="font-bold">Sign in with an access pass</span> on the Keston sign-in page, and enter
          {{ user.email }} and this code. Then they<template v-if="form.requirePasswordChange">
            choose a new password and</template
          >
          set up MFA.
        </p>
      </div>
      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="issue">
        <RadioGroup v-model="form.kind" label="Type" :options="kinds" />
        <Select v-model="form.hours" label="Expires after" :options="hourOptions" />
        <Checkbox
          v-model="form.requirePasswordChange"
          label="They need a new password too"
          description="E.g. they’ve forgotten it. They’ll choose one when they sign in."
        />
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button v-if="code" variant="primary" @click="close">Done</Button>
      <template v-else>
        <Button :disabled="issueStatus !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="issueStatus" loading-text="Issuing" @click="issue">Issue access pass</Button>
      </template>
    </template>
  </Slideover>
</template>
