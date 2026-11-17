import { ref } from 'vue'
import { api } from './api'

/** Pending app requests in the organisation being looked at: the sidebar badge. */
export const pendingRequests = ref(0)

export async function refreshRequestCount(orgId: string) {
  pendingRequests.value = (await api.appRequestCount(orgId).catch(() => ({ pending: 0 }))).pending
}
