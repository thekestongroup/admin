import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { loadMe } from './lib/api'
import { currentUser, signIn } from './lib/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Signing in isn't needed (the sign-in callback). */
    public?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/callback', component: () => import('./pages/Callback.vue'), meta: { public: true, title: 'Signing in' } },
    {
      path: '/',
      component: () => import('./pages/AdminLayout.vue'),
      children: [
        // Platform admins start at every organisation; global admins at theirs.
        {
          path: '',
          component: () => import('./pages/Organisations.vue'),
          beforeEnter: async () => {
            const me = await loadMe()
            return me.platformAdmin ? '/organisations' : `/organisations/${me.organisation.id}/accounts`
          },
        },
        { path: 'organisations', component: () => import('./pages/Organisations.vue'), meta: { title: 'Organisations' } },
        {
          path: 'organisations/new',
          component: () => import('./pages/NewOrganisation.vue'),
          meta: { title: 'New organisation' },
        },
        {
          path: 'organisations/:orgId/accounts',
          component: () => import('./pages/Accounts.vue'),
          meta: { title: 'Accounts' },
        },
        {
          path: 'organisations/:orgId/password-policy',
          component: () => import('./pages/PasswordPolicy.vue'),
          meta: { title: 'Password policy' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Everything but the callback needs signing in with Keston ID.
router.beforeEach(async (to) => {
  if (to.meta.public) return
  if (!(await currentUser())) {
    await signIn(to.fullPath)
    return false
  }
})

router.afterEach((to, from) => {
  document.title = to.meta.title ? `${to.meta.title} – Keston Admin` : 'Keston Admin'
  if (!from.matched.length) return
  nextTick(() => document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }))
})
