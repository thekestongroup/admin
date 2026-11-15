<script setup lang="ts">
import { LifeBuoy, ShieldAlert } from '@lucide/vue'
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

/**
 * An organisation: its details, Keston support access, and the
 * organisation lockout procedure.
 *
 * - Keston support (platform admins) sees this page for every organisation,
 *   but its users only while a global admin has approved support access.
 *   They can ask for access, or start the lockout procedure if nobody there
 *   can sign in.
 * - Its global admins approve or deny requests, end access, and deny a
 *   lockout request (it goes through after 3 days otherwise).
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

const isOwnAdmin = computed(() => me.value?.user.role === 'global_admin' && me.value.organisation.id === orgId)
const isSupport = computed(() => !!me.value?.platformAdmin && !isOwnAdmin.value)
const pendingRequests = computed(() => support.value?.requests.filter((r) => r.status === 'pending') ?? [])
const pendingLockout = computed(() => support.value?.lockouts.find((l) => l.status === 'pending'))
const history = computed(() => (support.value?.requests ?? []).filter((r) => r.status !== 'pending').slice(0, 5))

const details = computed(() =>
  org.value
    ? [
        { label: 'Name', value: org.value.name },
        { label: 'Domain', value: org.value.domain, description: `Users sign in as name@${org.value.domain}` },
        { label: 'Users', value: org.value.userCount },
        { label: 'Created', value: formatDate(org.value.createdAt) },
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
    reasonError.value = 'Say why, so the organisation’s admins can decide'
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
      title: lockout ? 'Lockout procedure started' : 'Support access requested',
      description: lockout
        ? 'Every global admin has been told. Unless one denies it, you’ll have access in 3 days.'
        : 'Its global admins have been asked to approve it.',
    })
  } catch (e) {
    askStatus.value = 'idle'
    if (e instanceof ApiError && e.field === 'reason') reasonError.value = e.message
    else notify({ type: 'error', title: 'Couldn’t send it', description: message(e) })
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
    notify({ type: 'error', title: 'Couldn’t do that', description: message(e) })
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card v-if="error">
      <EmptyState :icon="ShieldAlert" title="Couldn’t load the organisation" :description="error" />
    </Card>
    <div v-else-if="!org || !support" class="flex justify-center py-12"><Spinner label="Loading" /></div>
    <template v-else>
      <PageHeader :title="org.name" :description="org.domain" />

      <!-- A lockout request waiting: shown first, to its global admins. -->
      <Card v-if="pendingLockout" class="border-red">
        <div class="flex flex-col gap-3" role="alert">
          <div class="flex items-center gap-2">
            <ShieldAlert class="size-5 text-red" aria-hidden="true" />
            <h2 class="text-base font-bold">An organisation lockout request has been made</h2>
          </div>
          <p class="text-sm">
            {{ pendingLockout.requester ?? 'Keston support' }} was told nobody at {{ org.name }} can sign in:
            “{{ pendingLockout.reason }}”.
          </p>
          <p class="text-sm">
            Unless a global admin denies it by <span class="font-bold">{{ formatDateTime(pendingLockout.effectiveAt) }}</span>,
            Keston support will be given access for 7 days, to restore it.
          </p>
          <div class="flex gap-2">
            <Button
              v-if="isOwnAdmin"
              variant="danger"
              :status="busy === 'lockout' ? 'loading' : 'idle'"
              @click="act('lockout', () => api.decideLockout(orgId, pendingLockout!.id, 'deny'), 'Lockout request denied')"
            >
              Deny the request
            </Button>
            <Button
              v-if="me?.platformAdmin"
              :status="busy === 'cancel' ? 'loading' : 'idle'"
              @click="act('cancel', () => api.decideLockout(orgId, pendingLockout!.id, 'cancel'), 'Lockout request cancelled')"
            >
              Cancel it
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Details">
        <SummaryList :items="details" />
      </Card>

      <Card title="Keston support access" description="Keston support can only see this organisation’s users while a global admin allows it.">
        <template #actions>
          <Badge v-if="support.access.active" color="yellow">On until {{ formatDateTime(support.access.until!) }}</Badge>
          <Badge v-else color="green">Off</Badge>
        </template>
        <div class="flex flex-col gap-4">
          <!-- Requests waiting for a decision. -->
          <ul v-if="pendingRequests.length" class="flex flex-col gap-3">
            <li v-for="req in pendingRequests" :key="req.id" class="flex flex-col gap-2 rounded border border-black/15 p-3">
              <p class="text-sm">
                <span class="font-bold">{{ req.requester ?? 'Keston support' }}</span> asked on
                {{ formatDateTime(req.createdAt) }}: “{{ req.reason }}”
              </p>
              <div v-if="isOwnAdmin" class="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  :status="busy === req.id + 'a' ? 'loading' : 'idle'"
                  @click="act(req.id + 'a', () => api.decideSupport(orgId, req.id, 'approve', 7), 'Support access approved for 7 days')"
                >
                  Approve for 7 days
                </Button>
                <Button
                  size="sm"
                  :status="busy === req.id + 'd' ? 'loading' : 'idle'"
                  @click="act(req.id + 'd', () => api.decideSupport(orgId, req.id, 'deny'), 'Support access denied')"
                >
                  Deny
                </Button>
              </div>
              <p v-else class="text-xs text-black/65">Waiting for one of its global admins.</p>
            </li>
          </ul>

          <div class="flex flex-wrap gap-2">
            <Button
              v-if="isOwnAdmin && support.access.active"
              variant="danger"
              size="sm"
              :status="busy === 'revoke' ? 'loading' : 'idle'"
              @click="act('revoke', () => api.revokeSupport(orgId), 'Support access ended')"
            >
              End support access now
            </Button>
            <template v-if="isSupport && !support.access.active">
              <Button size="sm" variant="primary" :disabled="pendingRequests.length > 0" @click="ask('support')">
                <template #leading><LifeBuoy /></template>
                Ask for support access
              </Button>
              <Button size="sm" :disabled="!!pendingLockout" @click="ask('lockout')">
                <template #leading><ShieldAlert /></template>
                Start lockout procedure
              </Button>
            </template>
          </div>

          <div v-if="history.length" class="flex flex-col gap-1">
            <p class="text-sm font-bold">Recently</p>
            <ul class="flex flex-col gap-1 text-xs text-black/65">
              <li v-for="req in history" :key="req.id">
                {{ formatDate(req.createdAt) }}: {{ req.via === 'lockout' ? 'Lockout procedure' : 'Request' }}
                {{ req.status }}<template v-if="req.requester"> ({{ req.requester }})</template>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </template>

    <Slideover
      v-model:open="askOpen"
      :title="asking === 'lockout' ? 'Start the organisation lockout procedure' : 'Ask for support access'"
      :description="
        asking === 'lockout'
          ? 'Only when nobody at the organisation can sign in. Every global admin is told, and it goes through in 3 days unless one denies it.'
          : 'Its global admins are asked to approve it. They can end it at any time.'
      "
      initial-focus="auto"
    >
      <template #body>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="send">
          <Input
            v-model="reason"
            label="Why"
            :helper="asking === 'lockout' ? 'e.g. Their only global admin has left, and nobody can reset passwords.' : 'e.g. Their office asked us to check why a teacher can’t sign in.'"
            :error-text="reasonError"
          />
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="askStatus !== 'idle'" @click="close">Cancel</Button>
        <Button :variant="asking === 'lockout' ? 'danger' : 'primary'" :status="askStatus" loading-text="Sending" @click="send">
          {{ asking === 'lockout' ? 'Start the procedure' : 'Send request' }}
        </Button>
      </template>
    </Slideover>
  </div>
</template>
