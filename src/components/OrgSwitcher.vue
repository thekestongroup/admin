<script setup lang="ts">
import { Building2, ChevronRight, Search } from '@lucide/vue'
import { Badge, Button, type ButtonStatus, EmptyState, Slideover, Spinner, useNotifications } from '@thekestongroup/ui'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, type MyOrganisation } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The organisation switcher, opened from the organisation's name in the
 * account menu: your own organisation (Home) and the ones you're a guest in
 * (Guest), and for TKG Admins "Browse all organisations" (the list with
 * search). You can leave an organisation you're a guest in here too.
 */
const props = defineProps<{
  /** The organisation open now. */
  currentId?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const router = useRouter()
const { notify } = useNotifications()

const list = ref<MyOrganisation[]>([])
const canBrowseAll = ref(false)
const loading = ref(false)
const error = ref<string>()
const leaving = ref<MyOrganisation>()
const leaveStatus = ref<ButtonStatus>('idle')

async function load() {
  loading.value = true
  error.value = undefined
  try {
    const res = await api.myOrganisations()
    list.value = res.organisations
    canBrowseAll.value = res.canBrowseAll
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
watch(open, (o) => {
  if (o) {
    leaving.value = undefined
    load()
  }
})

function go(to: string) {
  open.value = false
  router.push(to)
}

async function leave() {
  const o = leaving.value
  if (!o?.guestId) return
  leaveStatus.value = 'loading'
  try {
    await api.leaveGuest(o.guestId)
    notify({ type: 'success', title: t('switcher.left', { name: o.name }) })
    const wasHere = props.currentId === o.id
    leaving.value = undefined
    await load()
    if (wasHere) go(`/organisations/${list.value[0]?.id ?? ''}`)
  } catch (e) {
    notify({ type: 'error', title: t('switcher.couldntLeave'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    leaveStatus.value = 'idle'
  }
}
</script>

<template>
  <Slideover v-model:open="open" :title="t('switcher.title')" :description="t('switcher.description')">
    <template #body>
      <div v-if="loading && !list.length" class="flex justify-center py-8"><Spinner :label="t('common.loading')" /></div>
      <EmptyState v-else-if="error" size="sm" :icon="Building2" :title="t('switcher.couldntLoad')" :description="error" />
      <!-- Leaving, confirmed -->
      <div v-else-if="leaving" class="flex flex-col gap-4">
        <h3 class="text-base font-bold">{{ t('switcher.leaveTitle', { name: leaving.name }) }}</h3>
        <p class="text-sm">{{ t('switcher.leaveDescription', { name: leaving.name }) }}</p>
        <div class="flex gap-2">
          <Button :disabled="leaveStatus !== 'idle'" @click="leaving = undefined">{{ t('common.cancel') }}</Button>
          <Button variant="danger" :status="leaveStatus" @click="leave">{{ t('switcher.leaveConfirm') }}</Button>
        </div>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="o in list" :key="o.id" class="flex items-center gap-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-black/15 bg-surface p-3 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-current="o.id === currentId ? 'true' : undefined"
            :disabled="!o.canManage"
            :class="{ 'opacity-60': !o.canManage }"
            @click="go(`/organisations/${o.id}`)"
          >
            <Building2 class="size-5 shrink-0" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-bold">{{ o.name }}</span>
              <span class="truncate text-xs text-black/65">{{ o.canManage ? o.domain : t('switcher.noAccess') }}</span>
            </span>
            <Badge size="sm" :color="o.home ? 'primary' : 'blue'">{{ o.home ? t('switcher.home') : t('switcher.guest') }}</Badge>
            <Badge v-if="o.id === currentId" size="sm" color="green">{{ t('switcher.current') }}</Badge>
          </button>
          <Button v-if="o.guestId" size="sm" @click="leaving = o">{{ t('switcher.leave') }}</Button>
        </li>
        <li v-if="canBrowseAll">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-dashed border-black/30 p-3 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="go('/organisations')"
          >
            <Search class="size-5 shrink-0" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-bold">{{ t('switcher.browseAll') }}</span>
              <span class="text-xs text-black/65">{{ t('switcher.browseAllDescription') }}</span>
            </span>
            <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>
  </Slideover>
</template>
