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
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

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
      title: required ? t('signInCard.pwRequired') : t('signInCard.pwNotRequired'),
      description: required ? t('signInCard.pwWillChoose', { name: props.user.name }) : undefined,
    })
  } catch (e) {
    notify({ type: 'error', title: t('signInCard.couldntChange'), description: message(e) })
  } finally {
    pwStatus.value = 'idle'
  }
}

// ── Access passes ───────────────────────────────────────────────────────────

function passStatus(p: AccessPass): { label: string; color: 'green' | 'basic' } {
  if (p.active) return { label: t('signInCard.pass.active'), color: 'green' }
  if (p.revokedAt) return { label: t('signInCard.pass.revoked'), color: 'basic' }
  if (p.oneTime && p.lastUsedAt) return { label: t('signInCard.pass.used'), color: 'basic' }
  return { label: t('signInCard.pass.expired'), color: 'basic' }
}

function passDetail(p: AccessPass) {
  const kind = p.oneTime ? t('signInCard.oneTime') : t('signInCard.timeLimited')
  const until = p.active ? t('signInCard.until', { date: formatDateTime(p.expiresAt) }) : ''
  const by = p.createdBy ? ` · ${t('signInCard.issuedBy', { name: p.createdBy })}` : ''
  return `${kind}${until}${by}`
}

const issuing = ref(false)
const kinds = computed(() => [
  { label: t('signInCard.oneTime'), value: 'one-time', description: t('signInCard.oneTimeDescription') },
  { label: t('signInCard.timeLimited'), value: 'time-limited', description: t('signInCard.timeLimitedDescription') },
])
const hourOptions = computed(() => Array.from({ length: 8 }, (_, i) => ({ label: t('signInCard.hours', i + 1), value: String(i + 1) })))
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
    notify({ type: 'error', title: t('signInCard.couldntIssue'), description: message(e) })
  }
}

const revoking = ref<string>()
async function revoke(p: AccessPass) {
  revoking.value = p.id
  try {
    await api.revokeAccessPass(props.orgId, props.user.id, p.id)
    await reload()
    notify({ type: 'success', title: t('signInCard.revoked'), description: t('signInCard.revokedDescription') })
  } catch (e) {
    notify({ type: 'error', title: t('signInCard.couldntRevoke'), description: message(e) })
  } finally {
    revoking.value = undefined
  }
}
</script>

<template>
  <Card :title="t('signInCard.title')" :description="t('signInCard.description')">
    <p v-if="error" class="text-sm text-red" role="alert">{{ error }}</p>
    <div v-else-if="!state" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
    <div v-else class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <p class="flex-1 text-sm font-bold">{{ t('signInCard.newPassword') }}</p>
          <Badge v-if="state.passwordChangeRequired" color="yellow">{{ t('signInCard.required') }}</Badge>
          <Badge v-else>{{ t('signInCard.notRequired') }}</Badge>
        </div>
        <p class="text-sm text-black/65">
          <template v-if="state.passwordChangeRequired">
            {{ t('signInCard.willChooseNew') }}
          </template>
          <template v-else>{{ t('signInCard.currentPassword') }}</template>
        </p>
        <div v-if="canRequirePassword">
          <Button
            v-if="state.passwordChangeRequired"
            :status="pwStatus"
            :loading-text="t('common.saving')"
            @click="setPasswordChange(false)"
          >
            {{ t('signInCard.dontRequire') }}
          </Button>
          <Button v-else :status="pwStatus" :loading-text="t('common.saving')" @click="setPasswordChange(true)">
            {{ t('signInCard.requireChange') }}
          </Button>
        </div>
      </div>

      <div v-if="state.mfaRequired" class="flex flex-col gap-1">
        <p class="text-sm font-bold">{{ t('signInCard.mfaRequired') }}</p>
        <p class="text-sm text-black/65">
          <template v-if="user.mfa">{{ t('signInCard.mfaUses') }}</template>
          <template v-else>{{ t('signInCard.mfaWillSetUp') }}</template>
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <p class="flex-1 text-sm font-bold">{{ t('signInCard.accessPasses') }}</p>
          <Button v-if="canIssuePasses && user.status === 'active'" size="sm" @click="startIssue">
            <template #leading><Ticket /></template>
            {{ t('signInCard.issue') }}
          </Button>
        </div>
        <p class="text-sm text-black/65">
          {{ t('signInCard.passExplanation') }}
        </p>
        <ul v-if="state.accessPasses.length" class="flex flex-col divide-y divide-black/10">
          <li v-for="p in state.accessPasses" :key="p.id" class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm">{{ t('signInCard.issued', { date: formatDateTime(p.createdAt) }) }}</span>
              <span class="text-xs text-black/65">{{ passDetail(p) }}</span>
            </span>
            <Badge size="sm" :color="passStatus(p).color">{{ passStatus(p).label }}</Badge>
            <Button
              v-if="p.active && canIssuePasses"
              size="sm"
              variant="ghost"
              :status="revoking === p.id ? 'loading' : 'idle'"
              :loading-text="t('signInCard.revoking')"
              @click="revoke(p)"
            >
              {{ t('signInCard.revoke') }}
            </Button>
          </li>
        </ul>
        <p v-else class="text-sm text-black/65">{{ t('signInCard.noPasses') }}</p>
      </div>
    </div>
  </Card>

  <Slideover
    v-model:open="issuing"
    :title="code ? t('signInCard.giveTitle') : t('signInCard.issueTitle', { name: user.name })"
    :description="code ? t('signInCard.giveDescription') : t('signInCard.issueDescription')"
  >
    <template #body>
      <div v-if="code" class="flex flex-col gap-4">
        <p class="rounded bg-surface-muted px-3 py-4 text-center font-mono text-xl font-bold tracking-wide select-all">
          {{ code }}
        </p>
        <I18nT
          :keypath="form.requirePasswordChange ? 'signInCard.howToUseWithPassword' : 'signInCard.howToUse'"
          tag="p"
          scope="global"
          class="text-sm"
        >
          <template #action><span class="font-bold">{{ t('signInCard.signInWithPass') }}</span></template>
          <template #email>{{ user.email }}</template>
        </I18nT>
      </div>
      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="issue">
        <RadioGroup v-model="form.kind" :label="t('signInCard.type')" :options="kinds" />
        <Select v-model="form.hours" :label="t('signInCard.expiresAfter')" :options="hourOptions" />
        <Checkbox
          v-model="form.requirePasswordChange"
          :label="t('signInCard.needNewPassword')"
          :description="t('signInCard.needNewPasswordDescription')"
        />
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>
    <template #footer="{ close }">
      <Button v-if="code" variant="primary" @click="close">{{ t('common.done') }}</Button>
      <template v-else>
        <Button :disabled="issueStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="issueStatus" :loading-text="t('signInCard.issuing')" @click="issue">{{ t('signInCard.issue') }}</Button>
      </template>
    </template>
  </Slideover>
</template>
