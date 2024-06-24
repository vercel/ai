<script lang="ts" setup>
import { useAssistant } from '@ai-sdk/vue';
import type { Message } from '@ai-sdk/vue';

const roleToColorMap: Record<Message['role'], string> = {
  system: 'red',
  user: 'black',
  function: 'blue',
  tool: 'purple',
  assistant: 'green',
  data: 'orange',
};

const { messages, status, input, handleSubmit, error, stop } = useAssistant({
  api: '/api/assistant',
});

// Create a reference of the input element and focus on it when the component is mounted & the assistant status is 'awaiting_message'
const inputRef = ref<HTMLInputElement | null>(null);

watchEffect(() => {
  if (inputRef.value && status.value === 'awaiting_message') {
    inputRef.value.focus();
  }
});
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <!-- Render Assistant API errors if any -->
    <div
      class="relative px-6 py-4 text-white bg-red-500 rounded-md"
      v-if="error"
    >
      <span class="block sm:inline"> Error: {{ error?.toString() }} </span>
    </div>

    <!-- Render Assistant Messages -->
    <div
      class="whitespace-pre-wrap"
      v-for="(message, index) in messages"
      :key="index"
      :style="{ color: roleToColorMap[message.role] }"
    >
      <strong>{{ `${message.role}: ` }}</strong>
      {{ message.role !== 'data' && message.content }}
      <template v-if="message.role === 'data'">
        {{ (message.data as any)?.description }}
        <br />
        <pre class="bg-gray-200">{{
          JSON.stringify(message.data, null, 2)
        }}</pre>
      </template>
      <br />
      <br />
    </div>

    <!-- Render Assistant Status Indicator (In Progress) -->
    <div
      class="w-full h-8 max-w-md p-2 mb-8 bg-gray-300 rounded-lg dark:bg-gray-600 animate-pulse"
      v-if="status === 'in_progress'"
    ></div>

    <!-- Render Assistant Message Input Form -->
    <form @submit.prevent="(e) => handleSubmit(e as any)">
      <input
        ref="inputRef"
        :disabled="status === 'in_progress'"
        class="fixed w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl bottom-14 ax-w-md"
        v-model="input"
        placeholder="What is the temperature in the living room?"
      />
    </form>

    <button
      @click="stop"
      :disabled="status === 'awaiting_message'"
      class="fixed bottom-0 w-full max-w-md p-2 mb-8 text-white bg-red-500 rounded-lg disabled:opacity-50"
    >
      Stop
    </button>
  </div>
</template>
