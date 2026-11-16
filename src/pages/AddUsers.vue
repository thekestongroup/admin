<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck, Plus, TriangleAlert, X } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Notification,
  PageHeader,
  Popover,
  CheckboxGroup,
  Select,
  Spinner,
  Steps,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ApiError, api, type BulkResult, type Organisation, type Product } from '../lib/api'
import PasswordField from '../components/PasswordField.vue'
import UserDetailsTable from '../components/UserDetailsTable.vue'
import { suggestUsername } from '../lib/usernames'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Adding a list of users at once, in steps: Users (a row each: first name,
 * last name, username, domain), then Licences (for admins who can assign
 * them), then what happened. Everyone is a member. Each gets their own
 * temporary password (shown once), or all get one the admin sets (e.g. for
 * a new school year, changed at first sign-in).
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()
const MAX = 250

const org = ref<Organisation>()
const loadError = ref<string>()
const canAssign = computed(() => !!org.value?.permissions?.includes('users.licences'))
const steps = computed(() => (canAssign.value ? [t('users.title'), t('licences.title')] : [t('users.title')]))
const step = ref(0)
const last = computed(() => step.value === steps.value.length - 1)

// ── Users ───────────────────────────────────────────────────────────────────

interface Row {
  key: number
  first: string
  last: string
  username: string
  /** Typed by hand: stop suggesting one from the name. */
  usernameEdited: boolean
  domain: string
  errors: Record<string, string | undefined>
}
let nextKey = 0
const newRow = (): Row => ({
  key: nextKey++,
  first: '',
  last: '',
  username: '',
  usernameEdited: false,
  domain: domains.value[0] ?? '',
  errors: {},
})
const rows = ref<Row[]>([])
const requireChange = ref(true)
const usersError = ref<string>()

// The organisation's domains (one for now; each row picks one).
const domains = computed(() => (org.value ? (org.value.domains ?? [org.value.domain]) : []))
const domainOptions = computed(() => domains.value.map((d) => ({ label: d, value: d })))
const allDomain = ref<string>()
function changeAllDomains() {
  if (!allDomain.value) return
  for (const r of rows.value) r.domain = allDomain.value
  notify({ type: 'success', title: t('addUsers.everyUserNow', { domain: allDomain.value }) })
}

// One password for everyone, instead of each their own.
const autoPassword = ref(true)
const sharedPassword = ref('')
const sharedValid = ref(false)
const passwordError = ref<string>()

/** From their name, in the organisation's username format (Settings). */
function suggest(r: Row) {
  if (r.usernameEdited) return
  r.username = suggestUsername(org.value?.usernameFormat, r.first, r.last)
}

function typedUsername(r: Row, v: string) {
  r.username = v
  r.usernameEdited = v !== ''
}

const filled = (r: Row) => !!(r.first.trim() || r.last.trim() || r.username.trim())
const people = computed(() => rows.value.filter(filled))

function focusField(name: string) {
  document.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.focus()
}

async function addRow() {
  rows.value.push(newRow())
  await nextTick()
  focusField(`first-${rows.value.at(-1)!.key}`)
}

function removeRow(r: Row) {
  rows.value = rows.value.filter((x) => x !== r)
  if (!rows.value.length) rows.value.push(newRow())
}

function checkUsers(): boolean {
  usersError.value = undefined
  const seen = new Map<string, Row>()
  for (const r of rows.value) {
    r.errors = {}
    if (!filled(r)) continue
    if (!r.first.trim()) r.errors.first = t('addUser.errors.firstName')
    const u = r.username.trim().toLowerCase()
    if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(u))
      r.errors.username = t('addUsers.errors.username')
    else if (seen.has(`${u}@${r.domain}`)) r.errors.username = t('addUsers.errors.duplicate')
    seen.set(`${u}@${r.domain}`, r)
  }
  passwordError.value = undefined
  if (!autoPassword.value && !sharedValid.value)
    passwordError.value = sharedPassword.value ? t('password.notYetValid') : t('password.enter')
  if (!people.value.length) usersError.value = t('addUsers.errors.atLeastOne')
  else if (people.value.length > MAX) usersError.value = t('addUsers.errors.upTo', { max: MAX })
  const bad = rows.value.find((r) => Object.values(r.errors).some(Boolean))
  if (bad) focusField(`${bad.errors.first ? 'first' : 'username'}-${bad.key}`)
  return !usersError.value && !bad && !passwordError.value
}

// ── Licences ────────────────────────────────────────────────────────────────

const products = ref<Product[]>()
const licences = ref<string[]>([])

onMounted(async () => {
  try {
    org.value = await api.organisation(orgId)
    rows.value = Array.from({ length: 5 }, newRow)
    if (canAssign.value) {
      products.value = await api.products(orgId)
      licences.value = products.value.map((p) => p.id)
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})

// ── Steps ───────────────────────────────────────────────────────────────────

const heading = ref<HTMLElement>()
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}

const status = ref<ButtonStatus>('idle')
const results = ref<BulkResult[]>()

function next() {
  if (step.value === 0 && !checkUsers()) return
  if (!last.value) {
    step.value++
    focusHeading()
    return
  }
  add()
}

function previous() {
  step.value--
  focusHeading()
}

async function add() {
  status.value = 'loading'
  try {
    const res = await api.bulkCreate(orgId, {
      users: people.value.map((r) => ({
        name: `${r.first.trim()} ${r.last.trim()}`.trim(),
        username: r.username.trim(),
        domain: r.domain,
      })),
      password: autoPassword.value ? undefined : sharedPassword.value,
      licences: canAssign.value ? licences.value : [],
      requirePasswordChange: requireChange.value,
    })
    results.value = res.results
    status.value = 'idle'
    focusHeading()
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'licences') usersError.value = e.message
    if (e instanceof ApiError && e.field === 'password') {
      passwordError.value = e.message
      step.value = 0
    }
    notify({ type: 'error', title: t('addUsers.couldntAdd'), description: e instanceof Error ? e.message : String(e) })
  }
}

function startAgain() {
  rows.value = Array.from({ length: 5 }, newRow)
  results.value = undefined
  step.value = 0
  if (products.value) licences.value = products.value.map((p) => p.id)
  focusHeading()
}

// ── Done ────────────────────────────────────────────────────────────────────

const added = computed(() => results.value?.filter((r) => r.result === 'done') ?? [])
const skipped = computed(() => results.value?.filter((r) => r.result === 'skipped') ?? [])
const plural = (n: number) => t('addUsers.userCount', n)
const productNames = computed(() =>
  licences.value.map((id) => products.value?.find((p) => p.id === id)?.name ?? id).join(', '),
)
const shared = computed(() => !!results.value?.length && !results.value.some((r) => r.password))

const skippedColumns = computed<TableColumn<BulkResult>[]>(() => [
  { key: 'name', label: t('common.name'), rowHeader: true },
  { key: 'email', label: t('common.email') },
  { key: 'reason', label: t('bulkSummary.why'), nowrap: false },
])
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      :title="t('bulk.addMultiple')"
      :breadcrumb="[{ label: t('users.title'), to: `/organisations/${orgId}/users` }, { label: t('bulk.addMultiple') }]"
      :link-component="RouterLink"
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" :title="t('overview.couldntLoad')" :description="loadError" />
    </Card>
    <div v-else-if="!org" class="flex justify-center py-12"><Spinner :label="t('common.loading')" /></div>

    <!-- Done -->
    <template v-else-if="results">
      <Card>
        <div class="flex flex-col items-center gap-2 py-2 text-center">
          <CircleCheck v-if="added.length" class="size-10 text-green" aria-hidden="true" />
          <TriangleAlert v-else class="size-10 text-red" aria-hidden="true" />
          <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">
            {{ added.length ? t('addUsers.added', { users: plural(added.length) }) : t('addUsers.nobodyAdded') }}
          </h2>
          <p class="max-w-prose text-sm text-black/65">
            <template v-if="added.length && shared">{{ t('addUsers.signInShared') }}</template>
            <template v-else-if="added.length">
              {{ t('addUsers.giveDetails') }}
              <template v-if="requireChange">{{ t('addUsers.willChoose') }}</template>
            </template>
            <template v-if="skipped.length"> {{ t('addUsers.couldntBeAdded', { users: plural(skipped.length) }) }}</template>
          </p>
        </div>
      </Card>

      <UserDetailsTable
        v-if="added.length"
        :results="added"
        :title="t('addUsers.usersAdded')"
        :description="canAssign ? t('addUsers.licencesList', { names: productNames || t('common.noneLower') }) : undefined"
      />

      <Card v-if="skipped.length" :title="t('addUsers.notAdded')" padding="none">
        <Table :columns="skippedColumns" :rows="skipped" :row-key="(_r: BulkResult, i: number) => i" size="sm" :caption="t('addUsers.usersNotAdded')" />
      </Card>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button @click="startAgain">{{ t('addUsers.addMore') }}</Button>
        <Button variant="primary" :as="RouterLink" :to="`/organisations/${orgId}/users`">{{ t('common.done') }}</Button>
      </div>
    </template>

    <!-- Steps -->
    <Card v-else>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <Steps v-if="steps.length > 1" :steps="steps" :step="step" :label="t('bulk.addMultiple')" />

        <!-- Users -->
        <div v-if="step === 0" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">{{ t('addUsers.title') }}</h2>
            <p class="text-sm text-black/65">{{ t('addUsers.description', { max: MAX }) }}</p>
          </div>

          <!-- A table of fields: the headings once, each field labelled for
               screen readers ("First name, user 2"). Scrolls sideways on
               narrow screens. -->
          <div class="-m-1 overflow-x-auto p-1">
            <div
              class="grid grid-cols-[repeat(3,minmax(--spacing(36),1fr))_auto_minmax(--spacing(44),1fr)_auto] items-start gap-x-2 gap-y-3"
            >
              <p class="text-sm" aria-hidden="true">{{ t('addUser.firstName') }}</p>
              <p class="text-sm" aria-hidden="true">{{ t('addUser.lastName') }}</p>
              <p class="text-sm" aria-hidden="true">{{ t('addUser.username') }}</p>
              <span />
              <div class="flex items-center gap-2">
                <p class="text-sm" aria-hidden="true">{{ t('organisations.columns.domain') }}</p>
                <Popover v-if="domains.length">
                  <Button size="sm" variant="ghost">{{ t('addUsers.changeAll') }}</Button>
                  <template #content="{ close }">
                    <div class="flex w-72 flex-col gap-3 p-4">
                      <Select v-model="allDomain" :label="t('addUsers.domainForEvery')" :options="domainOptions" :placeholder="t('addUsers.chooseDomain')" />
                      <div class="flex justify-end gap-2">
                        <Button @click="close">{{ t('common.cancel') }}</Button>
                        <Button variant="primary" :disabled="!allDomain" @click="changeAllDomains(); close()">{{ t('addUsers.changeAllConfirm') }}</Button>
                      </div>
                    </div>
                  </template>
                </Popover>
              </div>
              <span />

              <div v-for="(r, i) in rows" :key="r.key" role="group" :aria-label="t('addUsers.userN', { n: i + 1 })" class="contents">
                <Input
                  :data-field="`first-${r.key}`"
                  v-model="r.first"
                  :label="t('addUsers.fieldFor', { field: t('addUser.firstName'), n: i + 1 })"
                  hide-label
                  autocomplete="off"
                  :error-text="r.errors.first"
                  @update:model-value="suggest(r)"
                />
                <Input v-model="r.last" :label="t('addUsers.fieldFor', { field: t('addUser.lastName'), n: i + 1 })" hide-label autocomplete="off" @update:model-value="suggest(r)" />
                <Input
                  :data-field="`username-${r.key}`"
                  :model-value="r.username"
                  :label="t('addUsers.fieldFor', { field: t('addUser.username'), n: i + 1 })"
                  hide-label
                  autocapitalize="off"
                  spellcheck="false"
                  autocomplete="off"
                  :error-text="r.errors.username"
                  @update:model-value="typedUsername(r, String($event ?? ''))"
                />
                <span class="flex h-9.5 items-center text-sm text-black/65" aria-hidden="true">@</span>
                <Select v-model="r.domain" :label="t('addUsers.fieldFor', { field: t('organisations.columns.domain'), n: i + 1 })" hide-label :options="domainOptions" />
                <Button variant="ghost" square :aria-label="t('addUsers.removeUserN', { n: i + 1 })" @click="removeRow(r)">
                  <X />
                </Button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button :disabled="rows.length >= MAX" @click="addRow">
              <template #leading><Plus /></template>
              {{ t('addUsers.addAnother') }}
            </Button>
            <p class="text-sm text-black/65">{{ t('addUsers.toAdd', { users: plural(people.length) }) }}</p>
          </div>
          <p v-if="usersError" class="text-sm text-red" role="alert">{{ usersError }}</p>

          <Checkbox
            v-model="autoPassword"
            :label="t('password.auto')"
            :description="t('addUsers.autoDescription')"
          />
          <template v-if="!autoPassword">
            <Notification
              type="warning"
              :title="t('bulk.resetPassword.sameTitle')"
              :description="t('addUsers.sameDescription')"
              :dismissible="false"
            />
            <PasswordField v-model="sharedPassword" v-model:valid="sharedValid" :organisation-id="orgId" :error-text="passwordError" />
          </template>
          <Checkbox
            v-model="requireChange"
            :label="t('addUsers.requireChange')"
            :description="t('password.requireChangeDescription')"
          />
        </div>

        <!-- Licences -->
        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">{{ t('licences.title') }}</h2>
            <p class="text-sm text-black/65">{{ t('addUsers.licencesDescription', { users: plural(people.length) }) }}</p>
          </div>
          <EmptyState v-if="!products?.length" size="sm" :title="t('licences.none')" class="p-0" />
          <CheckboxGroup
            v-else
            v-model="licences"
            :label="t('licences.title')"
            hide-label
            :options="products.map((p) => ({ label: p.name, value: p.id, description: t('addUser.licenceDescription', { publisher: p.publisher }, p.assigned) }))"
          />
          <p v-if="usersError" class="text-sm text-red" role="alert">{{ usersError }}</p>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
            <template #leading><ArrowLeft /></template>
            {{ t('common.previous') }}
          </Button>
          <Button v-else :as="RouterLink" :to="`/organisations/${orgId}/users`">{{ t('common.cancel') }}</Button>
          <Button type="submit" variant="primary" :status="status" :loading-text="t('addUser.adding')">
            {{ last ? t('addUsers.addUsers', { users: plural(people.length) }) : t('common.next') }}
            <template v-if="!last" #trailing><ArrowRight /></template>
          </Button>
        </div>
      </form>
    </Card>
  </div>
</template>
