<script setup>
import { useChat } from 'ai/vue'

const { messages, input, handleSubmit } = useChat({
  headers: { 'Content-Type': 'application/json' }
})
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-for="message in messages" :key="message.id" class="whitespace-pre-wrap">
      <Icon
        :name="message.role === 'user' ? 'solar:user-linear' : 'solar:soundwave-square-line-duotone'"
      />
      {{ message.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ message.content }}
    </div>

    <form @submit="handleSubmit">
      <input
        v-model="input"
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        placeholder="Say something..."
      >
    </form>
  </div>
</template>
