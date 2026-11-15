<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck, Download, Plus, TriangleAlert, X } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Card,
  Checkbox,
  EmptyState,
  Input,
  PageHeader,
  Progress,
  Spinner,
  Table,
  type TableColumn,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ApiError, api, type BulkResult, type Organisation, type Product } from '../lib/api'
import { downloadCsv } from '../lib/csv'

/**
 * Adding a list of users at once, in steps: Users (a row each: first name,
 * last name, username), then Licences (for admins who can assign them),
 * then what happened, with each new user's temporary password (shown once).
 * Everyone is a member and gets their own password.
 */
const route = useRoute()
const orgId = route.params.orgId as string
const { notify } = useNotifications()
const MAX = 250

const org = ref<Organisation>()
const loadError = ref<string>()
const canAssign = computed(() => !!org.value?.permissions?.includes('users.licences'))
const steps = computed(() => (canAssign.value ? ['Users', 'Licences'] : ['Users']))
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
  errors: Record<string, string | undefined>
}
let nextKey = 0
const newRow = (): Row => ({ key: nextKey++, first: '', last: '', username: '', usernameEdited: false, errors: {} })
const rows = ref<Row[]>(Array.from({ length: 5 }, newRow))
const requireChange = ref(true)
const usersError = ref<string>()

/** first.last, in the characters a username allows. */
function suggest(r: Row) {
  if (r.usernameEdited) return
  const part = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  r.username = [part(r.first), part(r.last)].filter(Boolean).join('.')
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
    if (!r.first.trim()) r.errors.first = 'Enter their first name'
    const u = r.username.trim().toLowerCase()
    if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(u))
      r.errors.username = 'Use lowercase letters, numbers, dots, dashes or underscores'
    else if (seen.has(u)) r.errors.username = 'Already in the list'
    seen.set(u, r)
  }
  if (!people.value.length) usersError.value = 'Add at least one user'
  else if (people.value.length > MAX) usersError.value = `Add up to ${MAX} users at a time`
  const bad = rows.value.find((r) => Object.values(r.errors).some(Boolean))
  if (bad) focusField(`${bad.errors.first ? 'first' : 'username'}-${bad.key}`)
  return !usersError.value && !bad
}

// ── Licences ────────────────────────────────────────────────────────────────

const products = ref<Product[]>()
const licences = ref<string[]>([])
function toggleLicence(id: string, on: boolean) {
  licences.value = on ? [...licences.value, id] : licences.value.filter((l) => l !== id)
}

onMounted(async () => {
  try {
    org.value = await api.organisation(orgId)
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
      users: people.value.map((r) => ({ name: `${r.first.trim()} ${r.last.trim()}`.trim(), username: r.username.trim() })),
      licences: canAssign.value ? licences.value : [],
      requirePasswordChange: requireChange.value,
    })
    results.value = res.results
    status.value = 'idle'
    focusHeading()
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field === 'licences') usersError.value = e.message
    notify({ type: 'error', title: 'Couldn’t add the users', description: e instanceof Error ? e.message : String(e) })
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
const plural = (n: number) => `${n} ${n === 1 ? 'user' : 'users'}`
const productNames = computed(() =>
  licences.value.map((id) => products.value?.find((p) => p.id === id)?.name ?? id).join(', '),
)
const addedColumns: TableColumn<BulkResult>[] = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'Temporary password' },
]
const skippedColumns: TableColumn<BulkResult>[] = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'email', label: 'Email' },
  { key: 'reason', label: 'Why', nowrap: false },
]
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Add multiple users"
      :breadcrumb="[{ label: 'Users', to: `/organisations/${orgId}/users` }, { label: 'Add multiple users' }]"
      :link-component="RouterLink"
    />

    <Card v-if="loadError">
      <EmptyState :icon="TriangleAlert" title="Couldn’t load the organisation" :description="loadError" />
    </Card>
    <div v-else-if="!org" class="flex justify-center py-12"><Spinner label="Loading" /></div>

    <!-- Done -->
    <template v-else-if="results">
      <Card>
        <div class="flex flex-col items-center gap-2 py-2 text-center">
          <CircleCheck v-if="added.length" class="size-10 text-green" aria-hidden="true" />
          <TriangleAlert v-else class="size-10 text-red" aria-hidden="true" />
          <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">
            {{ added.length ? `${plural(added.length)} added` : 'Nobody was added' }}
          </h2>
          <p class="max-w-prose text-sm text-black/65">
            <template v-if="added.length">
              Give each person their email and temporary password securely. The passwords are shown only once: once you
              leave this page, they’re gone.
              <template v-if="requireChange">They’ll choose their own when they first sign in.</template>
            </template>
            <template v-if="skipped.length"> {{ plural(skipped.length) }} couldn’t be added, listed below.</template>
          </p>
        </div>
      </Card>

      <Card v-if="added.length" title="Added" :description="canAssign ? `Licences: ${productNames || 'none'}` : undefined" padding="none">
        <template #actions>
          <Button size="sm" @click="downloadCsv(added)">
            <template #leading><Download /></template>
            Download as CSV
          </Button>
        </template>
        <Table :columns="addedColumns" :rows="added" :row-key="(_r: BulkResult, i: number) => i" size="sm" caption="Users added">
          <template #cell-password="{ row }"><span class="font-mono select-all">{{ row.password }}</span></template>
        </Table>
      </Card>

      <Card v-if="skipped.length" title="Not added" padding="none">
        <Table :columns="skippedColumns" :rows="skipped" :row-key="(_r: BulkResult, i: number) => i" size="sm" caption="Users not added" />
      </Card>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button @click="startAgain">Add more users</Button>
        <Button variant="primary" :as="RouterLink" :to="`/organisations/${orgId}/users`">Done</Button>
      </div>
    </template>

    <!-- Steps -->
    <Card v-else>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <div v-if="steps.length > 1" class="flex flex-col gap-3">
          <Progress label="Add multiple users" segments :value="step + 1" :max="steps.length" />
          <p class="text-sm text-black/65">
            Step {{ step + 1 }} of {{ steps.length }}: <span class="text-black">{{ steps[step] }}</span>
          </p>
        </div>

        <!-- Users -->
        <div v-if="step === 0" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">Add a list of users</h2>
            <p class="text-sm text-black/65">
              Enter up to {{ MAX }} users. Everyone is added as a member and gets their own temporary password. Empty
              rows are left out.
            </p>
          </div>

          <fieldset v-for="(r, i) in rows" :key="r.key" class="flex items-start gap-2 border-t border-black/10 pt-4 first-of-type:border-t-0 first-of-type:pt-0">
            <legend class="sr-only">User {{ i + 1 }}</legend>
            <div class="grid flex-1 gap-3 sm:grid-cols-3">
              <Input :data-field="`first-${r.key}`" v-model="r.first" label="First name" autocomplete="off" :error-text="r.errors.first" @update:model-value="suggest(r)" />
              <Input v-model="r.last" label="Last name" autocomplete="off" @update:model-value="suggest(r)" />
              <Input
                :data-field="`username-${r.key}`"
                :model-value="r.username"
                label="Username"
                autocapitalize="off"
                spellcheck="false"
                autocomplete="off"
                :error-text="r.errors.username"
                @update:model-value="typedUsername(r, String($event ?? ''))"
              >
                <template #trailing><span class="text-sm text-black/65">@{{ org.domain }}</span></template>
              </Input>
            </div>
            <Button
              variant="ghost"
              square
              class="mt-6.5 shrink-0"
              :aria-label="`Remove user ${i + 1}`"
              @click="removeRow(r)"
            >
              <X />
            </Button>
          </fieldset>

          <div class="flex flex-wrap items-center gap-3">
            <Button :disabled="rows.length >= MAX" @click="addRow">
              <template #leading><Plus /></template>
              Add another user
            </Button>
            <p class="text-sm text-black/65">{{ plural(people.length) }} to add</p>
          </div>
          <p v-if="usersError" class="text-sm text-red" role="alert">{{ usersError }}</p>

          <Checkbox
            v-model="requireChange"
            label="Require these users to change their password on sign in"
            description="Recommended, so only they know their password."
          />
        </div>

        <!-- Licences -->
        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">Licences</h2>
            <p class="text-sm text-black/65">
              The Keston products these {{ plural(people.length) }} can use. Without a licence, they can’t sign in to it.
            </p>
          </div>
          <EmptyState v-if="!products?.length" size="sm" title="No products yet" class="p-0" />
          <fieldset v-else class="flex flex-col gap-3">
            <legend class="sr-only">Licences</legend>
            <Checkbox
              v-for="p in products"
              :key="p.id"
              :model-value="licences.includes(p.id)"
              :label="p.name"
              :description="`By ${p.publisher}. ${p.assigned === 1 ? '1 user has' : `${p.assigned} users have`} a licence.`"
              @update:model-value="toggleLicence(p.id, !!$event)"
            />
          </fieldset>
          <p v-if="usersError" class="text-sm text-red" role="alert">{{ usersError }}</p>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
            <template #leading><ArrowLeft /></template>
            Previous
          </Button>
          <Button v-else :as="RouterLink" :to="`/organisations/${orgId}/users`">Cancel</Button>
          <Button type="submit" variant="primary" :status="status" loading-text="Adding">
            {{ last ? `Add ${plural(people.length)}` : 'Next' }}
            <template v-if="!last" #trailing><ArrowRight /></template>
          </Button>
        </div>
      </form>
    </Card>
  </div>
</template>
