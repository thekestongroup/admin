<script setup lang="ts">
import { Building2, KeyRound, Users } from '@lucide/vue'
import { AppShell, Card, Spinner, type SidebarSection } from '@thekestongroup/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { ApiError, api, loadMe, type Me, type Organisation } from '../lib/api'
import { signOut } from '../lib/auth'

/**
 * Every Keston Admin page: the Keston header, and a sidebar with
 * Organisations (platform admins) and the organisation being managed.
 */
const route = useRoute()
const me = ref<Me>()
const error = ref<string>()

onMounted(async () => {
  try {
    me.value = await loadMe()
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'signed_out')) error.value = e instanceof Error ? e.message : String(e)
  }
})

// The organisation in the URL, for its name in the sidebar.
const orgId = computed(() => route.params.orgId as string | undefined)
const org = ref<Organisation>()
watch(
  orgId,
  async (id) => {
    org.value = id ? (me.value?.organisation.id === id ? me.value.organisation : await api.organisation(id).catch(() => undefined)) : undefined
  },
  { immediate: true },
)

const nav = computed<SidebarSection[]>(() => {
  const sections: SidebarSection[] = []
  const active = (to: string) => route.path === to
  if (me.value?.platformAdmin) {
    sections.push({
      items: [{ label: 'Organisations', icon: Building2, to: '/organisations', active: route.path.startsWith('/organisations') && !orgId.value }],
    })
  }
  const id = orgId.value ?? (me.value && !me.value.platformAdmin ? me.value.organisation.id : undefined)
  if (id) {
    const accounts = `/organisations/${id}/accounts`
    const policy = `/organisations/${id}/password-policy`
    sections.push({
      label: org.value?.name ?? me.value?.organisation.name ?? 'Organisation',
      items: [
        { label: 'Accounts', icon: Users, to: accounts, active: active(accounts) },
        { label: 'Password policy', icon: KeyRound, to: policy, active: active(policy) },
      ],
    })
  }
  return sections
})

const user = computed(() =>
  me.value ? { name: me.value.user.name, email: me.value.user.email, organisation: me.value.organisation.name } : undefined,
)

function accountSettings() {
  // Your own account (password, two-step) is in Keston ID.
  window.location.assign(`${window.location.protocol}//${window.location.hostname.replace(/^admin\./, 'id.')}/account`)
}
</script>

<template>
  <div v-if="error" class="flex min-h-dvh items-center justify-center bg-background p-4">
    <Card class="w-full max-w-100">
      <div class="flex flex-col gap-2">
        <h1 class="text-xl font-bold">You can't use Keston Admin</h1>
        <p class="text-sm" role="alert">{{ error }}</p>
      </div>
    </Card>
  </div>
  <div v-else-if="!me" class="flex min-h-dvh items-center justify-center bg-background"><Spinner label="Loading" /></div>
  <AppShell
    v-else
    title="Keston Admin"
    :sections="nav"
    :user="user"
    :link-component="RouterLink"
    :user-actions="['account-settings', 'log-out']"
    @account-settings="accountSettings"
    @log-out="signOut()"
  >
    <RouterView :key="route.fullPath" />
  </AppShell>
</template>
