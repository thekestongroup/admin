<script setup lang="ts">
import { Badge, Card, Link, RelativeTime, Spinner } from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { type AuditEntry, type SignInEntry, actionLabel, logsApi, methodLabels, reasonLabel } from '../lib/logs'

/**
 * A user's recent activity, on their page: their latest sign-ins and admin
 * actions by or about them, newest first, with a link to all of it in Logs.
 * Needs See logs (reports.view).
 */
const props = defineProps<{ orgId: string; userId: string }>()

type Item = { key: string; at: string; title: string; detail: string; failed?: string }
const items = ref<Item[]>([])
const loading = ref(true)
const error = ref(false)

const fromAction = (a: AuditEntry): Item => ({
  key: `a${a.id}`,
  at: a.createdAt,
  title: actionLabel(a.action),
  detail: [
    a.actorId === props.userId ? (a.targetType === 'user' && a.targetId !== props.userId ? a.targetName : '') : `By ${a.actorName}`,
    a.summary,
  ]
    .filter(Boolean)
    .join(' · '),
})
const fromSignIn = (s: SignInEntry): Item => ({
  key: `s${s.id}`,
  at: s.createdAt,
  title: s.method === 'app' ? `Signed in to ${s.clientName ?? 'an app'}` : `Sign-in: ${methodLabels[s.method] ?? s.method}`,
  detail: s.ip,
  failed: s.success ? undefined : reasonLabel(s.reason),
})

onMounted(async () => {
  try {
    const [a, s] = await Promise.all([
      logsApi.auditLog(props.orgId, { user: props.userId, limit: 8 }),
      logsApi.signIns(props.orgId, { user: props.userId, limit: 8 }),
    ])
    items.value = [...a.entries.map(fromAction), ...s.entries.map(fromSignIn)]
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, 8)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

const all = computed(() => ({ path: `/organisations/${props.orgId}/logs`, query: { user: props.userId } }))
</script>

<template>
  <Card title="Recent activity" description="Their sign-ins, and what admins did to their account or with it.">
    <Spinner v-if="loading" label="Loading" />
    <p v-else-if="error" class="text-sm text-black/65">Couldn’t load their activity.</p>
    <p v-else-if="!items.length" class="text-sm text-black/65">Nothing in the last year.</p>
    <ul v-else class="flex flex-col divide-y divide-black/10">
      <li v-for="i in items" :key="i.key" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
        <span class="font-bold">{{ i.title }}</span>
        <Badge v-if="i.failed" color="red" size="sm">{{ i.failed }}</Badge>
        <span v-if="i.detail" class="min-w-0 flex-1 text-black/65">{{ i.detail }}</span>
        <RelativeTime :date="i.at" class="ml-auto whitespace-nowrap text-black/65" />
      </li>
    </ul>
    <div class="mt-4">
      <Link :as="RouterLink" :to="all">See all in Logs</Link>
    </div>
  </Card>
</template>
