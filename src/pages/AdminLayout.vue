<script setup lang="ts">
import { AppWindow, Building2, House, KeyRound, LifeBuoy, ScrollText, Settings, ShieldCheck, Users, UsersRound } from '@lucide/vue'
import {
  AppShell,
  Button,
  Card,
  NotificationPane,
  Spinner,
  createNotifications,
  formatDateTime,
  type Notifications,
  type SidebarSection,
} from '@thekestongroup/ui'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ApiError, api, loadMe, type AdminNotification, type Me, type Organisation, type PermissionId } from '../lib/api'
import { signOut, switchUser } from '../lib/auth'

/**
 * Every Keston Admin page: the Keston header (with the notifications bell),
 * and a sidebar with Organisations (Keston support) and the organisation
 * being looked at.
 */
const route = useRoute()
const router = useRouter()
const me = ref<Me>()
const error = ref<string>()

// ── Notifications (support requests, lockout procedure…), from Keston ID ────

const notifications = shallowRef<Notifications>(createNotifications())
let lastIds = ''

function toInput(n: AdminNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    description: n.body,
    createdAt: new Date(n.createdAt),
    read: !!n.readAt,
    action: n.link ? { label: 'Open', onSelect: () => router.push(n.link) } : undefined,
  }
}

async function loadNotifications() {
  const list = await api.notifications().catch(() => undefined)
  if (!list) return
  const ids = list.map((n) => n.id + (n.readAt ? 'r' : '')).join()
  if (ids === lastIds) return
  lastIds = ids
  notifications.value = createNotifications(list.map(toInput))
}

// Opening the bell marks them read; Clear all clears them in Keston ID too.
watch(
  () => notifications.value.paneOpen,
  (open) => {
    if (open && notifications.value.unreadCount.value > 0) api.readNotifications().catch(() => {})
  },
)
watch(
  () => notifications.value.items.length,
  (n, before) => {
    if (n === 0 && before > 0) api.clearNotifications().then(() => (lastIds = '')).catch(() => {})
  },
)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  try {
    const loaded = await loadMe()
    // /v1/me answers for everyone; Keston Admin is for people with a
    // permission in their organisation, and Keston staff.
    if (!loaded.platformAdmin && !loaded.permissions.length) {
      error.value = 'Keston Admin is for your organisation’s admins. Ask one of them if you need something changed.'
      return
    }
    me.value = loaded
    await loadNotifications()
    timer = setInterval(loadNotifications, 60_000)
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'signed_out')) error.value = e instanceof Error ? e.message : String(e)
  }
})
onUnmounted(() => clearInterval(timer))

// ── Sidebar ─────────────────────────────────────────────────────────────────

// The organisation in the URL (or a global admin's own), for the sidebar.
const orgId = computed(
  () => (route.params.orgId as string | undefined) ?? (me.value && !me.value.platformAdmin ? me.value.organisation.id : undefined),
)
const org = ref<Organisation>()
watch(
  orgId,
  async (id) => {
    org.value = id ? await api.organisation(id).catch(() => undefined) : undefined
  },
  { immediate: true },
)

const nav = computed<SidebarSection[]>(() => {
  const sections: SidebarSection[] = []
  const active = (to: string, exact = true) => (exact ? route.path === to : route.path.startsWith(to))
  if (me.value?.platformAdmin) {
    sections.push({
      items: [{ label: 'Organisations', icon: Building2, to: '/organisations', active: route.path === '/organisations' }],
    })
  }
  const id = orgId.value
  if (id) {
    const base = `/organisations/${id}`
    const items: SidebarSection['items'] = [{ label: 'Overview', icon: House, to: base, active: active(base) }]
    // The rest, by what you can do here (Keston support: through a support account).
    const can = (p: PermissionId) => !!org.value?.permissions?.includes(p)
    if (can('users.view')) items.push({ label: 'Users', icon: Users, to: `${base}/users`, active: active(`${base}/users`, false) })
    if (can('users.view'))
      items.push({ label: 'Groups', icon: UsersRound, to: `${base}/groups`, active: active(`${base}/groups`, false) })
    if (can('apps.manage')) items.push({ label: 'Apps', icon: AppWindow, to: `${base}/apps`, active: active(`${base}/apps`) })
    if (can('policy.manage'))
      items.push({ label: 'Password policy', icon: KeyRound, to: `${base}/password-policy`, active: active(`${base}/password-policy`) })
    if (can('policy.manage'))
      items.push({
        label: 'Security',
        icon: ShieldCheck,
        children: [{ label: 'Manage MFA', icon: ShieldCheck, to: `${base}/security/mfa`, active: active(`${base}/security`, false) }],
      })
    if (can('settings.manage')) items.push({ label: 'Settings', icon: Settings, to: `${base}/settings`, active: active(`${base}/settings`) })
    if (can('reports.view')) items.push({ label: 'Logs', icon: ScrollText, to: `${base}/logs`, active: active(`${base}/logs`) })
    sections.push({ label: org.value?.name ?? 'Organisation', items })
  }
  return sections
})

const user = computed(() =>
  me.value
    ? { name: me.value.user.name, email: me.value.user.email, organisation: me.value.organisation.name, avatar: me.value.user.avatar }
    : undefined,
)

function accountSettings() {
  // Your own account (password, MFA, profile) is in Keston ID.
  window.location.assign(`${window.location.protocol}//${window.location.hostname.replace(/^admin\./, 'id.')}/account`)
}
</script>

<template>
  <div v-if="error" class="flex min-h-dvh items-center justify-center bg-background p-4">
    <Card class="w-full max-w-100">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <h1 class="text-xl font-bold">You can't use Keston Admin</h1>
          <p class="text-sm" role="alert">{{ error }}</p>
        </div>
        <!-- Signed in as someone who isn't an admin: try another account. -->
        <div class="flex flex-wrap gap-2">
          <Button variant="primary" @click="switchUser()">Switch user</Button>
          <Button @click="signOut()">Sign out</Button>
        </div>
      </div>
    </Card>
  </div>
  <div v-else-if="!me" class="flex min-h-dvh items-center justify-center bg-background"><Spinner label="Loading" /></div>
  <AppShell
    v-else
    title="Keston Admin"
    title-to="/"
    :sections="nav"
    :user="user"
    :link-component="RouterLink"
    :user-actions="['account-settings', 'switch-account', 'log-out']"
    @account-settings="accountSettings"
    @switch-account="switchUser()"
    @log-out="signOut()"
  >
    <template #header-trailing>
      <NotificationPane :notifications="notifications" />
    </template>
    <!-- Using a Keston support account in another organisation. -->
    <div v-if="me.user.support" class="flex flex-wrap items-center gap-3 border-b border-black/15 bg-surface-elevated px-4 py-3 text-sm sm:px-6" role="status">
      <LifeBuoy class="size-4 shrink-0 text-blue" aria-hidden="true" />
      <span class="flex-1">
        You’re using a Keston support account in <span class="font-bold">{{ me.organisation.name }}</span><template
          v-if="me.user.expiresAt"
        >, until {{ formatDateTime(me.user.expiresAt) }}</template>.
      </span>
      <Button size="sm" @click="switchUser()">Switch account</Button>
    </div>
    <!-- A new page for each path; pages whose URL carries filters (Logs)
         watch the query themselves, so typing in a filter isn't lost. -->
    <RouterView :key="route.path" />
  </AppShell>
</template>
