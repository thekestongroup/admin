<script setup lang="ts">
import {
  Badge,
  Button,
  type ButtonStatus,
  Card,
  EmptyState,
  Input,
  InputDate,
  InputTextArea,
  PageHeader,
  Select,
  Slideover,
  Spinner,
  Tabs,
  formatDate,
  formatDateTime,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type KestonMessage, type MessageCategory, type Organisation } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'
import { loadMessages, messages } from '../lib/platform'

const { t } = useI18n()
const { notify } = useNotifications()

/**
 * Message centre: announcements from Keston to organisations' admins. Read
 * and archived are each admin's own. TKG Admins (canPost) write and edit
 * them. Bodies are a safe Markdown subset (lib/markdown.ts): no raw HTML.
 */
const categories: MessageCategory[] = ['feature', 'change', 'action_required', 'notice']
const categoryColor: Record<MessageCategory, 'primary' | 'blue' | 'red' | 'basic'> = {
  feature: 'primary',
  change: 'blue',
  action_required: 'red',
  notice: 'basic',
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const loading = ref(true)
const tab = ref('inbox')
const posted = ref<KestonMessage[]>([])
const orgs = ref<Organisation[]>([])

async function reload() {
  await loadMessages()
  if (messages.value?.canPost) posted.value = await api.allMessages().catch(() => posted.value)
}

onMounted(async () => {
  await reload()
  if (messages.value?.canPost) orgs.value = await api.organisations().catch(() => [])
  loading.value = false
})

const shown = computed(() => (messages.value?.messages ?? []).filter((m) => (tab.value === 'archived' ? m.archived : !m.archived)))
const tabs = computed(() => [
  { label: t('messages.inbox'), value: 'inbox' },
  { label: t('messages.archived'), value: 'archived' },
  ...(messages.value?.canPost ? [{ label: t('messages.posted'), value: 'posted' }] : []),
])

async function setState(m: KestonMessage, action: 'read' | 'unread' | 'archive' | 'unarchive') {
  try {
    await api.setMessageState(m.id, action)
    await loadMessages()
  } catch (e) {
    notify({ type: 'error', title: t('messages.couldntUpdate'), description: message(e) })
  }
}

// ── Writing (TKG Admins) ────────────────────────────────────────────────────

const open = ref(false)
const editing = ref<KestonMessage>()
const form = ref({ title: '', body: '', category: 'notice' as MessageCategory, actionBy: '', allOrganisations: true, organisationIds: [] as string[] })
const errors = ref<Record<string, string>>({})
const status = ref<ButtonStatus>('idle')
const categoryOptions = computed(() => categories.map((c) => ({ label: t(`messages.category.${c}`), value: c })))
const audienceOptions = computed(() => [
  { label: t('messages.audience.all'), value: 'all' },
  { label: t('messages.audience.selected'), value: 'selected' },
])
const orgOptions = computed(() => orgs.value.map((o) => ({ label: o.name, value: o.id })))
const audience = computed({
  get: () => (form.value.allOrganisations ? 'all' : 'selected'),
  set: (v: string) => (form.value.allOrganisations = v === 'all'),
})

function write(m?: KestonMessage) {
  editing.value = m
  form.value = {
    title: m?.title ?? '',
    body: m?.body ?? '',
    category: m?.category ?? 'notice',
    actionBy: m?.actionBy ? m.actionBy.slice(0, 10) : '',
    allOrganisations: m?.allOrganisations ?? true,
    organisationIds: m?.organisationIds ?? [],
  }
  errors.value = {}
  status.value = 'idle'
  open.value = true
}

async function save() {
  const f = form.value
  errors.value = {}
  if (!f.title.trim()) errors.value.title = t('messages.errors.title')
  if (!f.body.trim()) errors.value.body = t('messages.errors.body')
  if (!f.allOrganisations && !f.organisationIds.length) errors.value.organisationIds = t('messages.errors.audience')
  if (Object.keys(errors.value).length) return
  status.value = 'loading'
  try {
    const body = { ...f, actionBy: f.actionBy || '' }
    if (editing.value) await api.editMessage(editing.value.id, body)
    else await api.postMessage(body)
    await reload()
    notify({ type: 'success', title: t(editing.value ? 'messages.updated' : 'messages.sent') })
    status.value = 'idle'
    open.value = false
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) errors.value = { [e.field]: e.message }
    else notify({ type: 'error', title: t('messages.couldntSave'), description: message(e) })
  }
}

async function remove(m: KestonMessage) {
  try {
    await api.deleteMessage(m.id)
    await reload()
    notify({ type: 'success', title: t('messages.deleted') })
  } catch (e) {
    notify({ type: 'error', title: t('messages.couldntSave'), description: message(e) })
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <PageHeader :title="t('messages.title')" :description="t('messages.description')">
      <template v-if="messages?.canPost" #actions>
        <Button variant="primary" @click="write()">{{ t('messages.new') }}</Button>
      </template>
    </PageHeader>

    <div v-if="loading" class="flex justify-center py-8"><Spinner :label="t('common.loading')" /></div>
    <template v-else>
      <Tabs v-model="tab" :tabs="tabs" :label="t('messages.title')" />

      <template v-if="tab !== 'posted'">
        <Card v-if="!shown.length"><EmptyState :title="t(tab === 'archived' ? 'messages.noArchived' : 'messages.none')" /></Card>
        <Card v-for="m in shown" :key="m.id">
          <article class="flex flex-col gap-3" :aria-label="m.title">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-bold">{{ m.title }}</h2>
              <Badge :color="categoryColor[m.category]">{{ t(`messages.category.${m.category}`) }}</Badge>
              <Badge v-if="!m.read" color="primary">{{ t('messages.unread') }}</Badge>
              <span class="ml-auto text-sm text-black/65">{{ formatDateTime(m.createdAt) }}</span>
            </div>
            <p v-if="m.actionBy" class="text-sm font-bold">{{ t('messages.actionBy', { date: formatDate(m.actionBy) }) }}</p>
            <!-- renderMarkdown escapes all input; only its own tags come out. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="message-body text-sm" v-html="renderMarkdown(m.body)" />
            <div class="flex flex-wrap gap-2">
              <Button size="sm" @click="setState(m, m.read ? 'unread' : 'read')">{{ m.read ? t('messages.markUnread') : t('messages.markRead') }}</Button>
              <Button size="sm" @click="setState(m, m.archived ? 'unarchive' : 'archive')">{{ m.archived ? t('messages.unarchive') : t('messages.archive') }}</Button>
            </div>
          </article>
        </Card>
      </template>

      <template v-else>
        <Card v-if="!posted.length"><EmptyState :title="t('messages.nonePosted')" /></Card>
        <Card v-for="m in posted" :key="m.id">
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="font-bold">{{ m.title }}</p>
              <p class="text-black/65">
                {{ t(`messages.category.${m.category}`) }} ·
                {{ m.allOrganisations ? t('messages.audience.all') : t('messages.audience.count', { count: m.organisationIds.length }, m.organisationIds.length) }}
                · {{ formatDateTime(m.createdAt) }}
              </p>
            </div>
            <Button size="sm" @click="write(m)">{{ t('messages.edit') }}</Button>
            <Button size="sm" @click="remove(m)">{{ t('messages.delete') }}</Button>
          </div>
        </Card>
      </template>
    </template>

    <Slideover v-model:open="open" :title="editing ? t('messages.edit') : t('messages.new')" initial-focus="auto">
      <template #body>
        <form id="message" class="flex flex-col gap-4" novalidate @submit.prevent="save">
          <Input v-model="form.title" :label="t('messages.fields.title')" :error-text="errors.title" />
          <InputTextArea v-model="form.body" :label="t('messages.fields.body')" :helper="t('messages.fields.bodyHelp')" :max-length="10000" :error-text="errors.body" />
          <Select v-model="form.category" :label="t('messages.fields.category')" :options="categoryOptions" />
          <InputDate v-model="form.actionBy" :label="t('messages.fields.actionBy')" :helper="t('messages.fields.actionByHelp')" :error-text="errors.actionBy" />
          <Select v-model="audience" :label="t('messages.fields.audience')" :options="audienceOptions" />
          <Select
            v-if="!form.allOrganisations"
            v-model="form.organisationIds"
            multiple
            searchable
            :label="t('messages.fields.organisations')"
            :options="orgOptions"
            :error-text="errors.organisationIds"
          />
        </form>
      </template>
      <template #footer="{ close }">
        <Button :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="message" variant="primary" :status="status" :loading-text="t('common.saving')">
          {{ editing ? t('common.save') : t('messages.send') }}
        </Button>
      </template>
    </Slideover>
  </div>
</template>

<style scoped>
.message-body :deep(p),
.message-body :deep(ul),
.message-body :deep(ol) {
  margin-bottom: 0.5rem;
}
.message-body :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
}
.message-body :deep(ol) {
  list-style: decimal;
  padding-left: 1.25rem;
}
.message-body :deep(h3) {
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.message-body :deep(a) {
  text-decoration: underline;
}
.message-body :deep(code) {
  font-family: ui-monospace, monospace;
}
</style>
