<script setup lang="ts">
import { ArrowLeft, ArrowRight, CircleCheck, Copy } from '@lucide/vue'
import {
  Button,
  type ButtonStatus,
  Checkbox,
  EmptyState,
  Input,
  Progress,
  RadioGroup,
  Slideover,
  Spinner,
  SummaryList,
  useNotifications,
} from '@thekestongroup/ui'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import PasswordField from './PasswordField.vue'
import { ApiError, api, type Organisation, type Product, type User } from '../lib/api'

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
  /** Has "Assign licences": the Licences step. */
  canAssignLicences: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()
const { notify } = useNotifications()

const steps = computed(() => (props.canAssignLicences ? ['User info', 'Licences'] : ['User info']))
const step = ref(0)
const last = computed(() => step.value === steps.value.length - 1)

const blank = () => ({
  name: '',
  username: '',
  role: 'member' as User['role'],
  autoPassword: true,
  password: '',
  requirePasswordChange: true,
  licences: [] as string[],
})
const form = reactive(blank())
const errors = reactive<Record<string, string | undefined>>({})
const passwordValid = ref(false)
const status = ref<ButtonStatus>('idle')
const username = computed(() => form.username.trim().toLowerCase())
const roles = [
  { label: 'Member', value: 'member', description: 'Signs in to Keston apps.' },
  { label: 'Global admin', value: 'global_admin', description: 'Also manages this organisation’s users and password policy here.' },
]

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
  for (const k of Object.keys(errors)) errors[k] = undefined
  step.value = 0
  status.value = 'idle'
  added.value = undefined
  if (props.canAssignLicences) loadProducts()
})

// Each step's heading takes focus, so screen readers hear where they are.
const heading = ref<HTMLElement>()
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}

function checkUserInfo() {
  for (const k of Object.keys(errors)) errors[k] = undefined
  if (!form.name.trim()) errors.name = 'Enter their name'
  if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(username.value))
    errors.username = 'Use lowercase letters, numbers, dots, dashes or underscores, like j.smith'
  if (!form.autoPassword && !passwordValid.value)
    errors.password = form.password ? 'The password doesn’t meet every rule yet' : 'Enter a password'
  return !errors.name && !errors.username && !errors.password
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

function toggleLicence(id: string, on: boolean) {
  form.licences = on ? [...form.licences, id] : form.licences.filter((l) => l !== id)
}

async function add() {
  status.value = 'loading'
  try {
    const licences = props.canAssignLicences ? form.licences : []
    const created = await api.createUser(props.orgId, {
      name: form.name.trim(),
      username: username.value,
      role: form.role,
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
      errors[e.field] = e.message
      // Name, username or password: back to User info to fix it.
      if (e.field !== 'licences') {
        step.value = 0
        focusHeading()
      }
    } else {
      notify({ type: 'error', title: 'Couldn’t add the user', description: e instanceof Error ? e.message : String(e) })
    }
  }
}

const productName = (id: string) => products.value?.find((p) => p.id === id)?.name ?? id
const summary = computed(() => {
  const a = added.value!
  const items = [{ label: 'Email', value: a.email }]
  if (a.password) items.push({ label: 'Password', value: a.password })
  if (props.canAssignLicences)
    items.push({ label: 'Licences', value: a.licences.length ? a.licences.map(productName).join(', ') : 'None' })
  return items
})

async function copyPassword(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    notify({ type: 'success', title: 'Password copied' })
  } catch {
    notify({ type: 'error', title: 'Couldn’t copy', description: 'Select the password and copy it instead.' })
  }
}
</script>

<template>
  <Slideover
    v-model:open="open"
    title="Add a user"
    :description="added ? undefined : org ? `They’ll sign in as username@${org.domain}.` : undefined"
    initial-focus="auto"
  >
    <!-- Done -->
    <template v-if="added" #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <CircleCheck class="size-10 text-green" aria-hidden="true" />
          <h2 ref="heading" tabindex="-1" class="text-xl font-bold outline-none">{{ added.name }} has been added</h2>
          <p class="text-sm text-black/65">
            <template v-if="added.password">Give them these details securely. The password is shown only once: once you close this, it’s gone.</template>
            <template v-else>They can sign in with the password you set.</template>
          </p>
        </div>
        <SummaryList :items="summary" layout="stacked">
          <template #value="{ item }">
            <span :class="item.label === 'Password' && 'font-mono select-all'">{{ item.value }}</span>
          </template>
        </SummaryList>
        <div v-if="added.password">
          <Button @click="copyPassword(added.password)">
            <template #leading><Copy /></template>
            Copy password
          </Button>
        </div>
        <p v-if="added.mustChange" class="text-sm text-black/65">They’ll choose their own password when they first sign in.</p>
      </div>
    </template>

    <template v-else #body>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="next">
        <div v-if="steps.length > 1" class="flex flex-col gap-3">
          <Progress label="Add a user" segments :value="step + 1" :max="steps.length" />
          <p class="text-sm text-black/65">
            Step {{ step + 1 }} of {{ steps.length }}: <span class="text-black">{{ steps[step] }}</span>
          </p>
        </div>

        <!-- User info -->
        <div v-if="step === 0" class="flex flex-col gap-4">
          <h2 ref="heading" tabindex="-1" class="sr-only outline-none">User info</h2>
          <Input v-model="form.name" label="Name" autocomplete="off" :error-text="errors.name" />
          <Input
            v-model="form.username"
            label="Username"
            autocapitalize="off"
            spellcheck="false"
            autocomplete="off"
            :error-text="errors.username"
          >
            <template #trailing><span class="text-sm text-black/65">@{{ org?.domain }}</span></template>
          </Input>
          <RadioGroup v-if="globalAdmin" v-model="form.role" label="Role" :options="roles" />
          <Checkbox v-model="form.autoPassword" label="Automatically create a password" description="Shown once after you add them." />
          <PasswordField
            v-if="!form.autoPassword"
            v-model="form.password"
            v-model:valid="passwordValid"
            :organisation-id="orgId"
            :username="username"
            :error-text="errors.password"
          />
          <Checkbox
            v-model="form.requirePasswordChange"
            label="Require this user to change their password on sign in"
            description="Recommended, so only they know their password."
          />
        </div>

        <!-- Licences -->
        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h2 ref="heading" tabindex="-1" class="font-bold outline-none">Licences</h2>
            <p class="text-sm text-black/65">The Keston products {{ form.name.trim() || 'they' }} can use. Without a licence, they can’t sign in to it.</p>
          </div>
          <EmptyState v-if="productsError" size="sm" title="Couldn’t load the products" :description="productsError" class="p-0" />
          <div v-else-if="!products" class="flex justify-center py-6"><Spinner label="Loading" /></div>
          <EmptyState v-else-if="!products.length" size="sm" title="No products yet" class="p-0" />
          <fieldset v-else class="flex flex-col gap-3">
            <legend class="sr-only">Licences</legend>
            <Checkbox
              v-for="p in products"
              :key="p.id"
              :model-value="form.licences.includes(p.id)"
              :label="p.name"
              :description="`By ${p.publisher}. ${p.assigned === 1 ? '1 user has' : `${p.assigned} users have`} a licence.`"
              @update:model-value="toggleLicence(p.id, !!$event)"
            />
          </fieldset>
          <p v-if="errors.licences" class="text-sm text-red">{{ errors.licences }}</p>
        </div>

        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>

    <template #footer="{ close }">
      <Button v-if="added" variant="primary" @click="close">Done</Button>
      <template v-else>
        <Button v-if="step > 0" :disabled="status !== 'idle'" @click="previous">
          <template #leading><ArrowLeft /></template>
          Previous
        </Button>
        <Button v-else :disabled="status !== 'idle'" @click="close">Cancel</Button>
        <Button variant="primary" :status="status" loading-text="Adding" @click="next">
          {{ last ? 'Add user' : 'Next' }}
          <template v-if="!last" #trailing><ArrowRight /></template>
        </Button>
      </template>
    </template>
  </Slideover>
</template>
