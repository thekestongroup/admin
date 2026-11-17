import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { landingOrganisation, loadMe } from './lib/api'
import { t } from './i18n'
import { currentUser, signIn } from './lib/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** A key in src/locales: the page's title, in the browser tab. */
    title?: string
    /** Signing in isn't needed (the sign-in callback). */
    public?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/callback', component: () => import('./pages/Callback.vue'), meta: { public: true, title: 'titles.signingIn' } },
    {
      path: '/support-handoff',
      component: () => import('./pages/SupportHandoff.vue'),
      meta: { public: true, title: 'titles.supportHandoff' },
    },
    // Self-service sign-up: anyone, no sign-in.
    {
      path: '/create-organisation',
      component: () => import('./pages/CreateOrganisation.vue'),
      meta: { public: true, title: 'titles.createOrganisation' },
    },
    {
      path: '/',
      component: () => import('./pages/AdminLayout.vue'),
      children: [
        // Everyone starts at their own organisation (or one they're a guest in
        // and can manage). TKG Admins browse the rest from the organisation
        // switcher in the account menu.
        {
          path: '',
          component: () => import('./pages/Organisations.vue'),
          beforeEnter: async () => {
            const me = await loadMe()
            return `/organisations/${(await landingOrganisation()) ?? me.organisation.id}`
          },
        },
        // Browse all organisations (TKG Admins; others see only their own).
        { path: 'organisations', component: () => import('./pages/Organisations.vue'), meta: { title: 'titles.browseOrganisations' } },
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
          meta: { title: 'titles.organisation' },
        },
        {
          path: 'organisations/:orgId/users/add',
          component: () => import('./pages/AddUsers.vue'),
          meta: { title: 'titles.addUsers' },
        },
        {
          path: 'organisations/:orgId/users/deleted',
          component: () => import('./pages/DeletedUsers.vue'),
          meta: { title: 'titles.deletedUsers' },
        },
        {
          path: 'organisations/:orgId/users/:userId',
          component: () => import('./pages/UserDetail.vue'),
          meta: { title: 'titles.user' },
        },
        {
          path: 'organisations/:orgId/apps',
          component: () => import('./pages/OrganisationApps.vue'),
          meta: { title: 'titles.apps' },
        },
        {
          path: 'organisations/:orgId/apps/new',
          component: () => import('./pages/OwnAppNew.vue'),
          meta: { title: 'titles.addApp' },
        },
        {
          path: 'organisations/:orgId/apps/new/keston',
          component: () => import('./pages/KestonAppNew.vue'),
          meta: { title: 'titles.addKestonApp' },
        },
        // The page an own app had before every app got one.
        { path: 'organisations/:orgId/apps/own/:appId', redirect: (to) => `/organisations/${to.params.orgId}/apps/${to.params.appId}` },
        {
          path: 'organisations/:orgId/apps/:appId',
          component: () => import('./pages/AppDetail.vue'),
          meta: { title: 'titles.app' },
        },
        {
          path: 'organisations/:orgId/groups',
          component: () => import('./pages/Groups.vue'),
          meta: { title: 'titles.groups' },
        },
        {
          path: 'organisations/:orgId/groups/:groupId',
          component: () => import('./pages/GroupDetail.vue'),
          meta: { title: 'titles.group' },
        },
        {
          path: 'organisations/:orgId/billing',
          redirect: (to) => `/organisations/${to.params.orgId}/billing/licences`,
        },
        {
          path: 'organisations/:orgId/billing/licences',
          component: () => import('./pages/BillingLicences.vue'),
          meta: { title: 'titles.billingLicences' },
        },
        {
          path: 'organisations/:orgId/settings',
          component: () => import('./pages/OrganisationSettings.vue'),
          meta: { title: 'titles.settings' },
        },
        {
          path: 'organisations/:orgId/settings/user-attributes',
          component: () => import('./pages/UserAttributes.vue'),
          meta: { title: 'titles.userAttributes' },
        },
        {
          path: 'organisations/:orgId/users',
          component: () => import('./pages/Users.vue'),
          meta: { title: 'titles.users' },
        },
        {
          path: 'organisations/:orgId/logs',
          component: () => import('./pages/Logs.vue'),
          meta: { title: 'titles.logs' },
        },
        { path: 'organisations/:orgId/security', redirect: (to) => `/organisations/${to.params.orgId}/security/mfa` },
        {
          path: 'organisations/:orgId/security/mfa',
          component: () => import('./pages/MfaSettings.vue'),
          meta: { title: 'titles.mfaSettings' },
        },
        {
          path: 'organisations/:orgId/security/guests',
          component: () => import('./pages/GuestSettings.vue'),
          meta: { title: 'titles.guestSettings' },
        },
        {
          path: 'organisations/:orgId/password-policy',
          component: () => import('./pages/PasswordPolicy.vue'),
          meta: { title: 'titles.passwordPolicy' },
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
  document.title = to.meta.title ? `${t(to.meta.title)} – ${t('layout.appName')}` : t('layout.appName')
  if (!from.matched.length) return
  nextTick(() => document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }))
})
