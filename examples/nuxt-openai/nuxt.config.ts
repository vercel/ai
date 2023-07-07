// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  nitro: {
    preset: 'vercel-edge' // you can use 'vercel' or other providers here
  },
  runtimeConfig: {
    openaiApiKey:
      process.env.NUXT_OPENAI_API_KEY ||
      (() => {
        throw new Error('NUXT_OPENAI_API_KEY is not set!')
      })()
  }
})
