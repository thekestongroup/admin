<script setup lang="ts">
import { AppWindow, BellRing, Building2, ChevronRight, CreditCard, House, KeyRound, LifeBuoy, ListChecks, ScrollText, Settings, ShieldCheck, Users, UsersRound } from '@lucide/vue'
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
import OrgSwitcher from '../components/OrgSwitcher.vue'
import PromptsPopup from '../components/PromptsPopup.vue'
import {
  ApiError,
  api,
  loadMe,
  type AdminNotification,
  type Me,
  type MyOrganisation,
  type Organisation,
  type PermissionId,
  type Prompts,
} from '../lib/api'
import { signOut, switchUser } from '../lib/auth'
import { I18nT, useI18n } from 'vue-i18n'

const { t } = useI18n()

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
    action: n.link
      ? {
          label: t('common.open'),
          // Invitations are answered in the pop-up.
          onSelect: () => (n.link === '/invitations' ? (showPrompts.value = true) : router.push(n.link)),
        }
      : undefined,
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

// ── Guest invitations and account moves: a one-time pop-up ──────────────────

const prompts = ref<Prompts>({ guestInvitations: [], moveRequests: [] })
const showPrompts = ref(false)
async function loadPrompts() {
  const p = await api.prompts().catch(() => undefined)
  if (p) prompts.value = p
}
async function answered() {
  await Promise.all([loadPrompts(), loadNotifications(), loadMine()])
  // Your organisations or your own account may have changed.
  org.value = orgId.value ? await api.organisation(orgId.value).catch(() => undefined) : undefined
}

// The organisations you can open (home, and guest in), for the switcher.
const mine = ref<MyOrganisation[]>([])
const switcherOpen = ref(false)
async function loadMine() {
  mine.value = (await api.myOrganisations().catch(() => undefined))?.organisations ?? []
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  try {
    const loaded = await loadMe()
    // /v1/me answers for everyone; Keston Admin is for people with a
    // permission in their organisation, in one they're a guest in, and
    // Keston staff.
    me.value = loaded
    await Promise.all([loadMine(), loadPrompts()])
    if (!loaded.platformAdmin && !loaded.permissions.length && !mine.value.some((o) => o.canManage)) {
      // Not an admin anywhere (their invitations are on their Keston ID account page).
      error.value = t('layout.notAnAdmin')
      me.value = undefined
      return
    }
    await loadNotifications()
    timer = setInterval(() => {
      loadNotifications()
      loadPrompts()
    }, 60_000)
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'signed_out')) error.value = e instanceof Error ? e.message : String(e)
  }
})
onUnmounted(() => clearInterval(timer))

// ── Sidebar ─────────────────────────────────────────────────────────────────

// The organisation in the URL (or a global admin's own), for the sidebar.
const orgId = computed(
  () =>
    (route.params.orgId as string | undefined) ??
    (me.value && (me.value.platformAdmin || me.value.permissions.length)
      ? me.value.organisation.id
      : mine.value.find((o) => o.canManage)?.id),
)
/** You're a guest in the organisation open now (not your own). */
const guestHere = computed(() => !!orgId.value && !!me.value && orgId.value !== me.value.organisation.id && mine.value.some((o) => o.id === orgId.value))
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
  const id = orgId.value
  if (id) {
    const base = `/organisations/${id}`
    const items: SidebarSection['items'] = [{ label: t('nav.overview'), icon: House, to: base, active: active(base) }]
    // The rest, by what you can do here (Keston support: through a support account).
    const can = (p: PermissionId) => !!org.value?.permissions?.includes(p)
    if (can('users.view')) items.push({ label: t('nav.users'), icon: Users, to: `${base}/users`, active: active(`${base}/users`, false) })
    if (can('users.view'))
      items.push({ label: t('nav.groups'), icon: UsersRound, to: `${base}/groups`, active: active(`${base}/groups`, false) })
    if (can('apps.manage')) items.push({ label: t('nav.apps'), icon: AppWindow, to: `${base}/apps`, active: active(`${base}/apps`) })
    if (can('policy.manage'))
      items.push({ label: t('nav.passwordPolicy'), icon: KeyRound, to: `${base}/password-policy`, active: active(`${base}/password-policy`) })
    if (can('policy.manage'))
      items.push({
        label: t('nav.security'),
        icon: ShieldCheck,
        children: [
          { label: t('nav.securityDefaults'), icon: ListChecks, to: `${base}/security/defaults`, active: active(`${base}/security/defaults`) },
          { label: t('nav.securityAlerts'), icon: BellRing, to: `${base}/security/alerts`, active: active(`${base}/security/alerts`) },
          { label: t('nav.mfaSettings'), icon: ShieldCheck, to: `${base}/security/mfa`, active: active(`${base}/security/mfa`) },
          { label: t('nav.guestSettings'), icon: Users, to: `${base}/security/guests`, active: active(`${base}/security/guests`) },
        ],
      })
    if (can('settings.manage'))
      items.push({
        label: t('nav.settings'),
        icon: Settings,
        children: [
          { label: t('nav.settingsGeneral'), icon: Settings, to: `${base}/settings`, active: active(`${base}/settings`) },
          { label: t('nav.userAttributes'), icon: ListChecks, to: `${base}/settings/user-attributes`, active: active(`${base}/settings/user-attributes`) },
        ],
      })
    if (can('reports.view')) items.push({ label: t('nav.logs'), icon: ScrollText, to: `${base}/logs`, active: active(`${base}/logs`) })
    sections.push({ label: org.value?.name ?? t('nav.organisation'), items })
    // Billing: Keston staff (in any organisation, with or without support
    // access) and its people who manage users or licences.
    if (me.value?.platformAdmin || can('users.view') || can('users.licences'))
      sections.push({
        label: t('nav.billing'),
        items: [{ label: t('nav.licences'), icon: CreditCard, to: `${base}/billing/licences`, active: active(`${base}/billing`, false) }],
      })
  }
  return sections
})

// The "Keston Admin" title goes to the current organisation's dashboard: the
// one in the URL, otherwise your own (also for Keston staff, who otherwise
// land on the list of organisations).
const homeTo = computed(() => {
  const id = orgId.value ?? me.value?.organisation.id
  return id ? `/organisations/${id}` : '/'
})

const user = computed(() =>
  me.value
    ? { name: me.value.user.name, email: me.value.user.email, organisation: me.value.organisation.name, avatar: me.value.user.avatar }
    : undefined,
)

/** The organisation you're looking at, named in the account menu. */
const currentName = computed(() => org.value?.name ?? me.value?.organisation.name ?? '')

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
          <h1 class="text-xl font-bold">{{ t('layout.cantUse') }}</h1>
          <p class="text-sm" role="alert">{{ error }}</p>
        </div>
        <!-- Signed in as someone who isn't an admin: try another account. -->
        <div class="flex flex-wrap gap-2">
          <Button variant="primary" @click="switchUser()">{{ t('layout.switchUser') }}</Button>
          <Button @click="signOut()">{{ t('layout.signOut') }}</Button>
        </div>
      </div>
    </Card>
  </div>
  <div v-else-if="!me" class="flex min-h-dvh items-center justify-center bg-background"><Spinner :label="t('common.loading')" /></div>
  <AppShell
    v-else
    :title="t('layout.appName')"
    :title-to="homeTo"
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
    <!-- The organisation switcher: the organisation's name in the account menu. -->
    <template #account-menu="{ close }">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        :aria-label="t('switcher.switchOrganisation')"
        @click="close(); switcherOpen = true"
      >
        <Building2 class="size-4 shrink-0" aria-hidden="true" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-bold">{{ currentName }}</span>
          <span class="text-xs text-black/65">{{ guestHere ? t('switcher.guest') : t('switcher.switchOrganisation') }}</span>
        </span>
        <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
      </button>
    </template>
    <!-- Using a Keston support account in another organisation. -->
    <div v-if="me.user.support" class="flex flex-wrap items-center gap-3 border-b border-black/15 bg-surface-elevated px-4 py-3 text-sm sm:px-6" role="status">
      <LifeBuoy class="size-4 shrink-0 text-blue" aria-hidden="true" />
      <span class="flex-1">
        <I18nT :keypath="me.user.expiresAt ? 'layout.supportAccountUntil' : 'layout.supportAccount'" tag="span" scope="global">
          <template #organisation><span class="font-bold">{{ me.organisation.name }}</span></template>
          <template v-if="me.user.expiresAt" #until>{{ formatDateTime(me.user.expiresAt) }}</template>
        </I18nT>
      </span>
      <Button size="sm" @click="switchUser()">{{ t('layout.switchAccount') }}</Button>
    </div>
    <!-- A new page for each path; pages whose URL carries filters (Logs)
         watch the query themselves, so typing in a filter isn't lost. -->
    <RouterView :key="route.path" />
    <OrgSwitcher v-model:open="switcherOpen" :current-id="orgId" />
    <PromptsPopup
      v-model:show="showPrompts"
      :invitations="prompts.guestInvitations"
      :moves="prompts.moveRequests"
      @answered="answered"
    />
  </AppShell>
</template>
