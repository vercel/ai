<script setup>
import { useChat } from 'ai/vue'

const { messages, input, handleInputChange, handleSubmit } = useChat()
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-for="m in messages" key="m.id" class="whitespace-pre-wrap">
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
    </div>
  
    <form @submit="handleSubmit">
      <input
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        v-model="input"
        placeholder="Say something..."
        @change="handleInputChange"
      />
    </form>
  </div>
</template>
