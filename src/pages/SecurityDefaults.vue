<script setup lang="ts">
import { CircleCheck, Circle, ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, useNotifications } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type SecurityDefaults, type SecurityItem } from '../lib/api'

/**
 * Security → Security defaults: recommended settings with a done / not done
 * status, why they matter and an Apply button (or a "How to fix" link for
 * advice), plus the Secure Score worked out by Keston ID.
 */
const { t } = useI18n()
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()

const state = ref<SecurityDefaults>()
const error = ref<string>()
const selected = ref<string[]>([])
const busy = ref(false)

onMounted(async () => {
  try {
    state.value = await api.securityDefaults(orgId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const links: Record<string, string> = {
  users: 'users',
  mfa: 'security/mfa',
  password: 'password-policy',
  guests: 'security/guests',
  'sign-ins': 'logs',
}
const linkTo = (i: SecurityItem) => ({
  path: `/organisations/${orgId}/${links[i.link] ?? ''}`,
  query: i.link === 'sign-ins' ? { view: 'sign-ins' } : i.id === 'admins_have_mfa' ? { mfa: 'off', role: 'global_admin' } : {},
})

async function apply(ids: string[]) {
  if (!ids.length) return
  busy.value = true
  try {
    const out = await api.applySecurityDefaults(orgId, ids)
    state.value = out.state
    selected.value = []
    const failed = out.results.filter((r) => r.result === 'failed').length
    notify(
      failed
        ? { type: 'error', title: t('securityDefaults.someFailed', { count: failed }) }
        : { type: 'success', title: t('securityDefaults.applied', { count: out.results.filter((r) => r.result === 'applied').length }) },
    )
  } catch (e) {
    notify({ type: 'error', title: t('securityDefaults.couldntApply'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

async function markReviewed() {
  busy.value = true
  try {
    state.value = await api.markSignInsReviewed(orgId)
  } catch (e) {
    notify({ type: 'error', title: t('securityDefaults.couldntApply'), description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

const scoreTone = computed(() => ((state.value?.score ?? 0) >= 80 ? 'text-green-700' : (state.value?.score ?? 0) >= 50 ? 'text-amber-700' : 'text-red-700'))
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('securityDefaults.title')"
      :description="t('securityDefaults.description')"
      :breadcrumb="[{ label: t('nav.security'), icon: ShieldCheck }, { label: t('securityDefaults.title') }]"
    />
    <Card v-if="error"><EmptyState :icon="TriangleAlert" :title="t('securityDefaults.couldntLoad')" :description="error" /></Card>
    <div v-else-if="!state" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Card>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-sm text-muted-foreground">{{ t('securityDefaults.score') }}</p>
            <p class="text-4xl font-semibold" :class="scoreTone" data-testid="score">{{ state.score }}%</p>
            <p class="text-sm text-muted-foreground">{{ t('securityDefaults.scoreDescription', { done: state.done, total: state.total }) }}</p>
          </div>
          <Button :disabled="!selected.length || busy" @click="apply(selected)">
            {{ t('securityDefaults.applySelected', { count: selected.length }) }}
          </Button>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded bg-muted" role="progressbar" :aria-valuenow="state.score" aria-valuemin="0" aria-valuemax="100" :aria-label="t('securityDefaults.score')">
          <div class="h-full bg-primary" :style="{ width: state.score + '%' }" />
        </div>
      </Card>

      <ul class="flex flex-col gap-3">
        <li v-for="item in state.items" :key="item.id">
          <Card>
            <div class="flex items-start gap-3">
              <input
                v-if="item.canApply && !item.done"
                v-model="selected"
                type="checkbox"
                class="mt-1 size-4"
                :value="item.id"
                :aria-label="t('securityDefaults.select', { name: t(`securityDefaults.items.${item.id}.title`) })"
              />
              <component :is="item.done ? CircleCheck : Circle" v-else class="mt-0.5 size-5 shrink-0" :class="item.done ? 'text-green-600' : 'text-muted-foreground'" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-medium">{{ t(`securityDefaults.items.${item.id}.title`) }}</h2>
                  <Badge :variant="item.done ? 'success' : 'warning'">{{ item.done ? t('securityDefaults.done') : t('securityDefaults.notDone') }}</Badge>
                  <span class="text-xs text-muted-foreground">{{ t('securityDefaults.points', { count: item.weight }) }}</span>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{{ t(`securityDefaults.items.${item.id}.why`) }}</p>
                <p v-if="!item.done && item.detail?.missing" class="mt-1 text-sm">
                  {{ t('securityDefaults.missing', { count: item.detail.missing }) }}
                </p>
              </div>
              <div v-if="!item.done" class="flex shrink-0 flex-col items-end gap-2">
                <Button v-if="item.canApply" size="sm" :disabled="busy" @click="apply([item.id])">{{ t('securityDefaults.apply') }}</Button>
                <RouterLink v-else class="text-sm text-primary underline" :to="linkTo(item)">{{ t('securityDefaults.howToFix') }}</RouterLink>
                <Button v-if="item.canMark" size="sm" variant="basic" :disabled="busy" @click="markReviewed">{{ t('securityDefaults.markReviewed') }}</Button>
              </div>
            </div>
          </Card>
        </li>
      </ul>
    </template>
  </div>
</template>
