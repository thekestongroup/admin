<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck, Copy } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Checkbox,
  CheckboxGroup,
  EmptyState,
  Input,
  Slideover,
  Spinner,
  Steps,
  SummaryList,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import PasswordField from './PasswordField.vue'
import RolesField, { type Roles } from './RolesField.vue'
import { suggestUsername } from '../lib/usernames'
import { ApiError, api, type AdminRole, type Organisation, type PermissionId, type Product } from '../lib/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Adding a user, in steps: User info, then Licences (for admins who can
 * assign them), then a confirmation with their email and, if Keston ID made
 * it up, their password (shown once).
 */
const props = defineProps<{
  orgId: string
  org?: Organisation
  /** Can make global admins. */
  globalAdmin: boolean
  /** Is a TKG Admin (can make them, in The Keston Group). */
  platformAdmin?: boolean
  /** Has "Assign licences": the Licences step. */
  canAssignLicences: boolean
  /** Can give admin roles ("Give permissions", or a global admin). */
  canAssignRoles: boolean
  /** Their own permissions here, for which roles they can give. */
  myPermissions: PermissionId[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()
const { notify } = useNotifications()

const steps = computed(() => (props.canAssignLicences ? [t('addUser.steps.userInfo'), t('addUser.steps.licences')] : [t('addUser.steps.userInfo')]))
const step = ref(0)
const last = computed(() => step.value === steps.value.length - 1)

const blank = () => ({
  first: '',
  last: '',
  username: '',
  /** Typed by hand: stop suggesting one from the name. */
  usernameEdited: false,
  access: { role: 'member', roles: [] as string[] } as Roles,
  autoPassword: true,
  password: '',
  requirePasswordChange: true,
  licences: [] as string[],
})
const form = reactive(blank())
const errors = reactive<Record<string, string | undefined>>({})
const passwordValid = ref(false)
/** Submitted without meeting the password rules: shows the unmet ones red. */
const passwordInvalid = ref(false)
const status = ref<ButtonStatus>('idle')
const username = computed(() => form.username.trim().toLowerCase())
const fullName = computed(() => `${form.first.trim()} ${form.last.trim()}`.trim())

/** From their name, in the organisation's username format (Settings). */
function suggest() {
  if (!form.usernameEdited) form.username = suggestUsername(props.org?.usernameFormat, form.first, form.last)
}
function typedUsername(v: string) {
  form.username = v
  form.usernameEdited = v !== ''
}
// The admin roles there are, for the User role field.
const catalogue = ref<AdminRole[]>([])

/** Done: what to show (the password only if Keston ID made it up). */
const added = ref<{ name: string; email: string; password?: string; mustChange: boolean; licences: string[] }>()

// Keston's products, for the Licences step.
const products = ref<Product[]>()
const productsError = ref<string>()
async function loadProducts() {
  productsError.value = undefined
  try {
    products.value = await api.products(props.orgId)
    // Every product, unless they're unticked.
    form.licences = products.value.map((p) => p.id)
  } catch (e) {
    productsError.value = e instanceof Error ? e.message : String(e)
  }
}

// A fresh start each time it opens.
watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, blank())
  passwordInvalid.value = false
  for (const k of Object.keys(errors)) errors[k] = undefined
  step.value = 0
  status.value = 'idle'
  added.value = undefined
  if (props.canAssignLicences) loadProducts()
  if (props.canAssignRoles && !catalogue.value.length) api.roles(props.orgId).then((r) => (catalogue.value = r)).catch(() => {})
})

// Each step's heading takes focus, so screen readers hear where they are.
const heading = ref<HTMLElement>()
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}

function checkUserInfo() {
  for (const k of Object.keys(errors)) errors[k] = undefined
  if (!form.first.trim()) errors.first = t('addUser.errors.firstName')
  if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(username.value))
    errors.username = t('addUser.errors.username')
  passwordInvalid.value = !form.autoPassword && !passwordValid.value
  return !errors.first && !errors.username && !passwordInvalid.value
}

function next() {
  if (step.value === 0 && !checkUserInfo()) return
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
    const licences = props.canAssignLicences ? form.licences : []
    const created = await api.createUser(props.orgId, {
      name: fullName.value,
      username: username.value,
      role: form.access.role === 'member' ? 'member' : 'global_admin',
      platformAdmin: form.access.role === 'tkg_admin' ? true : undefined,
      roles: form.access.role === 'member' ? form.access.roles : [],
      generatePassword: form.autoPassword,
      password: form.autoPassword ? undefined : form.password,
      requirePasswordChange: form.requirePasswordChange,
      licences,
    })
    added.value = {
      name: created.name,
      email: created.email,
      password: created.password,
      mustChange: form.requirePasswordChange,
      licences,
    }
    status.value = 'idle'
    emit('added')
    focusHeading()
  } catch (e) {
    status.value = 'idle'
    if (e instanceof ApiError && e.field) {
      errors[e.field === 'name' ? 'first' : e.field] = e.message
      // Name, username or password: back to User info to fix it.
      if (e.field !== 'licences') {
        step.value = 0
        focusHeading()
      }
    } else {
      notify({ type: 'error', title: t('addUser.couldntAdd'), description: e instanceof Error ? e.message : String(e) })
    }
  }
}

const productName = (id: string) => products.value?.find((p) => p.id === id)?.name ?? id
const summary = computed(() => {
  const a = added.value!
  const items = [{ label: t('common.email'), value: a.email }]
  if (a.password) items.push({ label: t('password.label'), value: a.password })
  if (props.canAssignLicences)
    items.push({ label: t('licences.title'), value: a.licences.length ? a.licences.map(productName).join(', ') : t('common.none') })
  return items
})

async function copyPassword(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    notify({ type: 'success', title: t('addUser.passwordCopied') })
  } catch {
    notify({ type: 'error', title: t('addUser.couldntCopy'), description: t('addUser.couldntCopyDescription') })
  }
}
</script>

<template>
  <Slideover
    v-model:open="open"
    :title="t('addUser.title')"
    initial-focus="auto"
  >
    <!-- Done -->
    <template v-if="added" #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <CircleCheck class="size-10 text-green" aria-hidden="true" />
          <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">{{ t('addUser.added', { name: added.name }) }}</h2>
          <p class="text-sm text-black/65">
            <template v-if="added.password">{{ t('addUser.giveDetails') }}</template>
            <template v-else>{{ t('addUser.signInWithSet') }}</template>
          </p>
        </div>
        <SummaryList :items="summary" layout="stacked">
          <template #value="{ item }">
            <span :class="item.label === t('password.label') && 'font-mono select-all'">{{ item.value }}</span>
          </template>
        </SummaryList>
        <div v-if="added.password">
          <Button @click="copyPassword(added.password)">
            <template #leading><Copy /></template>
            {{ t('addUser.copyPassword') }}
          </Button>
        </div>
        <p v-if="added.mustChange" class="text-sm text-black/65">{{ t('addUser.willChoose') }}</p>
      </div>
    </template>

    <template v-else #body>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <Steps v-if="steps.length > 1" :steps="steps" :step="step" :label="t('addUser.title')" />

        <!-- User info -->
        <div v-if="step === 0" class="flex flex-col gap-4">
          <h2 ref="heading" tabindex="-1" class="sr-only outline-none">{{ t('addUser.steps.userInfo') }}</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <Input v-model="form.first" :label="t('addUser.firstName')" autocomplete="off" :error-text="errors.first" @update:model-value="suggest" />
            <Input v-model="form.last" :label="t('addUser.lastName')" autocomplete="off" @update:model-value="suggest" />
          </div>
          <Input
            :model-value="form.username"
            :label="t('addUser.username')"
            autocapitalize="off"
            spellcheck="false"
            autocomplete="off"
            :error-text="errors.username"
            @update:model-value="typedUsername(String($event ?? ''))"
          >
            <template #trailing><span class="text-sm text-black/65">@{{ org?.domain }}</span></template>
          </Input>
          <RolesField
            v-if="canAssignRoles"
            v-model="form.access"
            :catalogue="catalogue"
            :i-am-global-admin="globalAdmin"
            :i-am-platform-admin="platformAdmin"
            :platform-org="org?.isPlatform"
            :my-permissions="myPermissions"
            :error-text="errors.roles"
          />
          <Checkbox v-model="form.autoPassword" :label="t('password.auto')" :description="t('addUser.autoDescription')" />
          <PasswordField
            v-if="!form.autoPassword"
            v-model="form.password"
            v-model:valid="passwordValid"
            v-model:invalid="passwordInvalid"
            :organisation-id="orgId"
            :username="username"
            :error-text="errors.password"
          />
          <Checkbox
            v-model="form.requirePasswordChange"
            :label="t('addUser.requireChange')"
            :description="t('password.requireChangeDescription')"
          />
        </div>

        <!-- Licences -->
        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="font-bold outline-none">{{ t('licences.title') }}</h2>
            <p class="text-sm text-black/65">{{ t('addUser.licencesDescription', { name: fullName || t('addUser.thisUser') }) }}</p>
          </div>
          <EmptyState v-if="productsError" size="sm" :title="t('licences.couldntLoad')" :description="productsError" class="p-0" />
          <div v-else-if="!products" class="flex justify-center py-6"><Spinner :label="t('common.loading')" /></div>
          <EmptyState v-else-if="!products.length" size="sm" :title="t('licences.none')" class="p-0" />
          <CheckboxGroup
            v-else
            v-model="form.licences"
            :label="t('licences.title')"
            hide-label
            :options="products.map((p) => ({ label: p.name, value: p.id, description: t('addUser.licenceDescription', { publisher: p.publisher }, p.assigned) }))"
          />
          <p v-if="errors.licences" class="text-sm text-red">{{ errors.licences }}</p>
        </div>

        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>

    <template #footer="{ close }">
      <Button v-if="added" variant="primary" @click="close">{{ t('common.done') }}</Button>
      <template v-else>
        <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
          <template #leading><ArrowLeft /></template>
          {{ t('common.previous') }}
        </Button>
        <Button v-else :disabled="status !== 'idle'" @click="close">{{ t('common.cancel') }}</Button>
        <Button variant="primary" :status="status" :loading-text="t('addUser.adding')" @click="next">
          {{ last ? t('addUser.addUser') : t('common.next') }}
          <template v-if="!last" #trailing><ArrowRight /></template>
        </Button>
      </template>
    </template>
  </Slideover>
</template>
