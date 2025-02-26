<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { createIdGenerator } from 'ai';

const { input, handleSubmit, messages } = useChat({
  api: '/api/use-chat-request',
  sendExtraMessageFields: true,
  generateId: createIdGenerator({ prefix: 'msgc', size: 16 }),

  experimental_prepareRequestBody({ messages }) {
    return {
      message: messages[messages.length - 1],
    };
  },
});

const messageList = computed(() => messages.value); // computer property for type inference
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="message in messageList"
      :key="message.id"
      class="whitespace-pre-wrap"
    >
      <strong>{{ `${message.role}: ` }}</strong>
      {{ message.content }}
    </div>

    <form @submit="handleSubmit">
      <input
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        v-model="input"
        placeholder="Say something..."
      />
    </form>
  </div>
</template>
