import { computed, ref } from 'vue'
import { api, type Health, type Messages } from './api'

/**
 * Service health and the message centre, shared by the layout (banner and
 * sidebar badge), the dashboard and their pages.
 */
export const health = ref<Health>()
export const messages = ref<Messages>()

export async function loadHealth() {
  health.value = await api.health().catch(() => health.value)
}
export async function loadMessages() {
  messages.value = await api.messages().catch(() => messages.value)
}

/** Open incidents, for the banner and the dashboard. */
export const activeIncidents = computed(() => health.value?.incidents.filter((i) => i.status !== 'resolved') ?? [])
export const unreadMessages = computed(() => messages.value?.unread ?? 0)
export const actionRequired = computed(() => messages.value?.actionRequired ?? [])
