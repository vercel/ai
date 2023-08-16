// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss', 'nuxt-icon'],
  nitro: {
    preset: 'vercel-edge' // you can use 'vercel' or other providers here
  },
  runtimeConfig: {
    openaiApiKey: ''
  }
})
