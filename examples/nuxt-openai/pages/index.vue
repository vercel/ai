<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { computed } from 'vue';

const { error, input, isLoading, handleSubmit, messages, reload, stop } =
  useChat({
    onFinish(message, { usage, finishReason }) {
      console.log('Usage', usage);
      console.log('FinishReason', finishReason);
    },
  });
const disabled = computed(() => isLoading.value || error.value != null);
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-for="m in messages" :key="m.id" class="whitespace-pre-wrap">
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
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

    <div v-if="error" class="mt-4">
      <div class="text-red-500">An error occurred.</div>
      <button
        type="button"
        class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
        @click="() => reload()"
      >
        Retry
      </button>
    </div>

    <form @submit="handleSubmit">
      <input
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        v-model="input"
        placeholder="Say something..."
        :disabled="disabled"
      />
    </form>
  </div>
</template>
