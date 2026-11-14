<script setup lang="ts">
import { Card, Link, Spinner } from '@thekestongroup/ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { signIn, userManager } from '../lib/auth'

/** Back from Keston ID: finish signing in, then go where we were going. */
const router = useRouter()
const error = ref<string>()

onMounted(async () => {
  try {
    const user = await userManager.signinRedirectCallback()
    const returnTo = (user.state as { returnTo?: string } | undefined)?.returnTo
    router.replace(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/')
  } catch (e) {
    const params = new URLSearchParams(window.location.search)
    error.value =
      params.get('error') === 'access_denied'
        ? "Keston ID didn't sign you in."
        : e instanceof Error
          ? e.message
          : String(e)
  }
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-background p-4">
    <Card v-if="error" class="w-full max-w-100">
      <div class="flex flex-col gap-2">
        <h1 class="text-xl font-bold">Couldn't sign you in</h1>
        <p class="text-sm" role="alert">{{ error }}</p>
        <p class="text-sm"><Link as="button" @click="signIn('/')">Try again</Link></p>
      </div>
    </Card>
    <Spinner v-else label="Signing you in" />
  </div>
</template>
