<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';

const { input, isLoading, handleSubmit, messages, stop, data, setData } =
  useChat({ api: '/api/use-chat-streamdata' });
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-if="data">
      <pre class="p-4 text-sm bg-gray-100">
        {{ JSON.stringify(data, null, 2) }}
      </pre>
      <button
        @click="() => setData(undefined)"
        class="px-4 py-2 mt-2 text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
      >
        Clear Data
      </button>
    </div>

    <div v-for="m in messages" :key="m.id" class="whitespace-pre-wrap">
      <strong>{{ m.role === 'user' ? 'User: ' : 'AI: ' }}</strong>
      {{ m.content }}
      <br />
      <br />
    </div>

    <div v-if="isLoading" class="mt-4 text-gray-500">
      <div>Loading...</div>
      <button
        type="button"
        class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
        @click="stop"
      >
        Stop
      </button>
    </div>

    <form @submit="handleSubmit">
      <input
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        v-model="input"
      />
    </form>
  </div>
</template>
