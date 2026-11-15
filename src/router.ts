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
      path: '/support-handoff',
      component: () => import('./pages/SupportHandoff.vue'),
      meta: { public: true, title: 'Opening support account' },
    },
    // Self-service sign-up: anyone, no sign-in.
    {
      path: '/create-organisation',
      component: () => import('./pages/CreateOrganisation.vue'),
      meta: { public: true, title: 'Create an organisation' },
    },
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
            return me.platformAdmin ? '/organisations' : `/organisations/${me.organisation.id}`
          },
        },
        { path: 'organisations', component: () => import('./pages/Organisations.vue'), meta: { title: 'Organisations' } },
        { path: 'organisations/new', redirect: '/create-organisation' },
        // Old links: these pages were called Accounts.
        { path: 'organisations/:orgId/accounts', redirect: (to) => `/organisations/${to.params.orgId}/users` },
        {
          path: 'organisations/:orgId/accounts/:userId',
          redirect: (to) => `/organisations/${to.params.orgId}/users/${to.params.userId}`,
        },
        {
          path: 'organisations/:orgId',
          component: () => import('./pages/OrganisationOverview.vue'),
          meta: { title: 'Organisation' },
        },
        {
          path: 'organisations/:orgId/users/:userId',
          component: () => import('./pages/UserDetail.vue'),
          meta: { title: 'User' },
        },
        {
          path: 'organisations/:orgId/apps',
          component: () => import('./pages/OrganisationApps.vue'),
          meta: { title: 'Apps' },
        },
        {
          path: 'organisations/:orgId/apps/new',
          component: () => import('./pages/OwnAppNew.vue'),
          meta: { title: 'Add an app' },
        },
        {
          path: 'organisations/:orgId/apps/own/:appId',
          component: () => import('./pages/OwnAppDetail.vue'),
          meta: { title: 'App' },
        },
        {
          path: 'organisations/:orgId/groups',
          component: () => import('./pages/Groups.vue'),
          meta: { title: 'Groups' },
        },
        {
          path: 'organisations/:orgId/groups/:groupId',
          component: () => import('./pages/GroupDetail.vue'),
          meta: { title: 'Group' },
        },
        {
          path: 'organisations/:orgId/settings',
          component: () => import('./pages/OrganisationSettings.vue'),
          meta: { title: 'Settings' },
        },
        {
          path: 'organisations/:orgId/users',
          component: () => import('./pages/Users.vue'),
          meta: { title: 'Users' },
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
