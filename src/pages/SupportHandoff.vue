<script setup lang="ts">
import { Spinner } from '@thekestongroup/ui'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { signInAsActiveAccount } from '../lib/auth'

/**
 * Back from Keston ID with a support account open: sign in to Keston Admin
 * as it, landing on that organisation.
 */
const route = useRoute()
onMounted(() => {
  const org = typeof route.query.org === 'string' ? route.query.org : ''
  signInAsActiveAccount(org ? `/organisations/${org}` : '/')
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-background"><Spinner label="Opening the support account" /></div>
</template>
