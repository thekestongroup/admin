import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { reloadOnStaleBuild } from './lib/staleBuild'
import { router } from './router'
import './style.css'

reloadOnStaleBuild(router)

createApp(App).use(router).use(i18n).mount('#app')
