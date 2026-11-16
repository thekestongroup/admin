<script setup lang="ts">
import { CalendarX, LifeBuoy, LogIn, ShieldAlert } from '@lucide/vue'
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Slideover,
  Spinner,
  SummaryList,
  formatDate,
  formatDateTime,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, api, loadMe, type Me, type Organisation, type Support } from '../lib/api'
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * An organisation: its details, Keston support access, and (for Keston
 * staff) the organisation lockout procedure.
 *
 * - Keston support (platform admins, in The Keston Group) sees this page for
 *   every organisation. To work with its users, they open a temporary support
 *   account in it, which the organisation allows from here.
 * - Its global admins allow or decline requests and end access whenever
 *   they like, and see and cancel a scheduled deletion.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const me = ref<Me>()
const org = ref<Organisation>()
const support = ref<Support>()
const error = ref<string>()

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function load() {
  ;[org.value, support.value] = await Promise.all([api.organisation(orgId), api.support(orgId)])
}

onMounted(async () => {
  try {
    me.value = await loadMe()
    await load()
  } catch (e) {
    error.value = message(e)
  }
})

// One of its own global admins (not a support account) decides.
const decides = computed(
  () => me.value?.user.role === 'global_admin' && me.value.organisation.id === orgId && !me.value.user.support,
)
// Keston staff looking at another organisation.
const isStaff = computed(() => !!me.value?.platformAdmin && me.value.organisation.id !== orgId)
const pendingRequests = computed(() => support.value?.requests.filter((r) => r.status === 'pending') ?? [])
const pendingLockout = computed(() => support.value?.lockouts.find((l) => l.status === 'pending'))
const history = computed(() => (support.value?.requests ?? []).filter((r) => r.status !== 'pending').slice(0, 5))
const statusWord = (s: string) => (['approved', 'denied', 'revoked'].includes(s) ? t(`overview.status.${s}`) : s)

const details = computed(() =>
  org.value
    ? [
        { label: t('common.name'), value: org.value.name },
        { label: t('organisations.columns.domain'), value: org.value.domain },
        { label: t('organisations.columns.users'), value: org.value.userCount },
        { label: t('organisations.columns.created'), value: formatDate(org.value.createdAt) },
      ]
    : [],
)

// ── Asking (Keston support) ─────────────────────────────────────────────────

const asking = ref<'support' | 'lockout'>()
const askOpen = computed({ get: () => !!asking.value, set: (v) => { if (!v) asking.value = undefined } })
const reason = ref('')
const reasonError = ref<string>()
const askStatus = ref<ButtonStatus>('idle')

function ask(kind: 'support' | 'lockout') {
  reason.value = ''
  reasonError.value = undefined
  askStatus.value = 'idle'
  asking.value = kind
}

async function send() {
  if (!reason.value.trim()) {
    reasonError.value = t('overview.sayWhy')
    return
  }
  askStatus.value = 'loading'
  try {
    if (asking.value === 'support') await api.requestSupport(orgId, reason.value)
    else await api.startLockout(orgId, reason.value)
    const lockout = asking.value === 'lockout'
    asking.value = undefined
    await load()
    notify({
      type: 'success',
      title: lockout ? t('overview.lockoutStarted') : t('overview.supportRequested'),
      description: lockout ? t('overview.lockoutStartedDescription') : t('overview.supportRequestedDescription'),
    })
  } catch (e) {
    askStatus.value = 'idle'
    if (e instanceof ApiError && e.field === 'reason') reasonError.value = e.message
    else notify({ type: 'error', title: t('overview.couldntSend'), description: message(e) })
  }
}

// Opening the support account: Keston ID signs this browser in to it.
const opening = ref(false)
async function openSupportAccount() {
  opening.value = true
  try {
    window.location.assign((await api.openSupportAccount(orgId)).url)
  } catch (e) {
    opening.value = false
    notify({ type: 'error', title: t('overview.couldntOpen'), description: message(e) })
  }
}

// ── Deciding (the organisation's global admins) ─────────────────────────────

const busy = ref<string>()
async function act(key: string, fn: () => Promise<unknown>, title: string) {
  busy.value = key
  try {
    await fn()
    await load()
    notify({ type: 'success', title })
  } catch (e) {
    notify({ type: 'error', title: t('bulk.couldntDoThat'), description: message(e) })
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="ShieldAlert" :title="t('overview.couldntLoad')" :description="error" />
    </Card>
    <div v-else-if="!org || !support" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <PageHeader :title="org.name" :description="org.domain">
        <template v-if="org.isPlatform" #badge><Badge color="primary">{{ t('overview.officialTkg') }}</Badge></template>
      </PageHeader>

      <!-- Scheduled for deletion. -->
      <Card v-if="org.deleteAfter">
        <div class="flex flex-col gap-3" role="status">
          <div class="flex items-center gap-2">
            <CalendarX class="size-5 text-black/65" aria-hidden="true" />
            <h2 class="text-base font-bold">{{ t('settings.deleteScheduled', { name: org.name, date: formatDate(org.deleteAfter) }) }}</h2>
          </div>
          <p class="text-sm">
            {{ t('overview.deletionExplanation') }}
          </p>
          <div v-if="decides">
            <Button
              :status="busy === 'undelete' ? 'loading' : 'idle'"
              @click="act('undelete', () => api.cancelDeletion(orgId), t('overview.deletionCancelled'))"
            >
              {{ t('overview.cancelDeletion') }}
            </Button>
          </div>
        </div>
      </Card>

      <!-- A lockout request waiting: shown first, to its global admins. -->
      <Card v-if="pendingLockout">
        <div class="flex flex-col gap-3" role="alert">
          <div class="flex items-center gap-2">
            <ShieldAlert class="size-5 text-red" aria-hidden="true" />
            <h2 class="text-base font-bold">{{ t('overview.lockoutMade') }}</h2>
          </div>
          <p class="text-sm">
            {{ t('overview.lockoutTold', { who: pendingLockout.requester ?? t('overview.kestonSupport'), org: org.name, reason: pendingLockout.reason }) }}
          </p>
          <I18nT keypath="overview.lockoutUnless" tag="p" scope="global" class="text-sm">
            <template #date><span class="font-bold">{{ formatDateTime(pendingLockout.effectiveAt) }}</span></template>
          </I18nT>
          <div class="flex gap-2">
            <Button
              v-if="decides"
              variant="danger"
              :status="busy === 'lockout' ? 'loading' : 'idle'"
              @click="act('lockout', () => api.decideLockout(orgId, pendingLockout!.id, 'deny'), t('overview.lockoutDeclined'))"
            >
              {{ t('overview.declineRequest') }}
            </Button>
            <Button
              v-if="isStaff"
              :status="busy === 'cancel' ? 'loading' : 'idle'"
              @click="act('cancel', () => api.decideLockout(orgId, pendingLockout!.id, 'cancel'), t('overview.lockoutCancelled'))"
            >
              {{ t('overview.cancelIt') }}
            </Button>
          </div>
        </div>
      </Card>

      <Card :title="t('overview.details')">
        <SummaryList :items="details" />
      </Card>

      <Card
        v-if="!org.isPlatform"
        :title="t('overview.support.title')"
        :description="t('overview.support.description')"
      >
        <template #actions>
          <Badge v-if="support.access.active" color="blue">{{ t('overview.support.allowedUntil', { date: formatDate(support.access.until!) }) }}</Badge>
          <Badge v-else>{{ t('overview.support.notAllowed') }}</Badge>
        </template>
        <div class="flex flex-col gap-4">
          <!-- Requests waiting for a decision. -->
          <ul v-if="pendingRequests.length" class="flex flex-col gap-3">
            <li v-for="req in pendingRequests" :key="req.id" class="flex flex-col gap-2 rounded border border-black/15 p-3">
              <I18nT keypath="overview.support.asked" tag="p" scope="global" class="text-sm">
                <template #who><span class="font-bold">{{ req.requester ?? t('overview.kestonSupport') }}</span></template>
                <template #date>{{ formatDateTime(req.createdAt) }}</template>
                <template #reason>{{ req.reason }}</template>
              </I18nT>
              <div v-if="decides" class="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  :status="busy === req.id + 'a' ? 'loading' : 'idle'"
                  @click="act(req.id + 'a', () => api.decideSupport(orgId, req.id, 'approve', 7), t('overview.support.allowedFor7'))"
                >
                  {{ t('overview.support.allowFor7') }}
                </Button>
                <Button
                  size="sm"
                  :status="busy === req.id + 'd' ? 'loading' : 'idle'"
                  @click="act(req.id + 'd', () => api.decideSupport(orgId, req.id, 'deny'), t('overview.support.declined'))"
                >
                  {{ t('overview.support.decline') }}
                </Button>
              </div>
              <p v-else class="text-xs text-black/65">{{ t('overview.support.waiting') }}</p>
            </li>
          </ul>

          <p v-if="support.access.active && decides" class="text-sm text-black/65">
            {{ t('overview.support.hasAccount') }}
          </p>

          <div class="flex flex-wrap gap-2">
            <Button
              v-if="decides && support.access.active"
              size="sm"
              :status="busy === 'revoke' ? 'loading' : 'idle'"
              @click="act('revoke', () => api.revokeSupport(orgId), t('overview.support.ended'))"
            >
              {{ t('overview.support.end') }}
            </Button>
            <template v-if="isStaff">
              <Button
                v-if="support.supportAccount"
                size="sm"
                variant="primary"
                :status="opening ? 'loading' : 'idle'"
                :loading-text="t('overview.support.opening')"
                @click="openSupportAccount"
              >
                <template #leading><LogIn /></template>
                {{ t('overview.support.openAccount') }}
              </Button>
              <template v-else>
                <Button size="sm" variant="primary" :disabled="pendingRequests.length > 0" @click="ask('support')">
                  <template #leading><LifeBuoy /></template>
                  {{ t('overview.support.ask') }}
                </Button>
                <Button size="sm" :disabled="!!pendingLockout" @click="ask('lockout')">
                  <template #leading><ShieldAlert /></template>
                  {{ t('overview.support.startLockout') }}
                </Button>
              </template>
            </template>
          </div>
          <p v-if="isStaff && support.supportAccount" class="text-xs text-black/65">
            {{ t('overview.support.signsYouIn', { org: org.name, email: support.supportAccount.email, until: formatDateTime(support.supportAccount.expiresAt) }) }}
          </p>

          <div v-if="history.length" class="flex flex-col gap-1">
            <p class="text-sm font-bold">{{ t('overview.support.recently') }}</p>
            <ul class="flex flex-col gap-1 text-xs text-black/65">
              <li v-for="req in history" :key="req.id">
                {{ formatDate(req.createdAt) }}: {{ req.via === 'lockout' ? t('overview.support.lockoutProcedure') : t('overview.support.request') }}
                {{ statusWord(req.status) }}<template v-if="req.requester"> ({{ req.requester }})</template>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </template>

    <Slideover
      v-model:open="askOpen"
      :title="asking === 'lockout' ? t('overview.ask.lockoutTitle') : t('overview.support.ask')"
      :description="asking === 'lockout' ? t('overview.ask.lockoutDescription') : t('overview.ask.supportDescription')"
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="send">
          <Input
            v-model="reason"
            :label="t('overview.ask.why')"
            :helper="asking === 'lockout' ? t('overview.ask.lockoutHelper') : t('overview.ask.supportHelper')"
            :error-text="reasonError"
          />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="askStatus !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button :variant="asking === 'lockout' ? 'danger' : 'primary'" :status="askStatus" :loading-text="t('overview.ask.sending')" @click="send">
          {{ asking === 'lockout' ? t('overview.ask.startProcedure') : t('overview.ask.send') }}
        </Button>
      </template>
    </Slideover>
  </div>
</template>
