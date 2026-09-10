<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { computed, ref } from 'vue';

const input = ref('');
const { error, messages, sendMessage, status, stop } = useChat({
  // Reduce Markdown and tool rendering work during high-frequency streams.
  // Stream processing and callbacks still run for every incoming chunk.
  throttle: 50,
});

const disabled = computed(() => status.value !== 'ready');

function handleSubmit(event: Event) {
  event.preventDefault();

  if (input.value.trim() === '') {
    return;
  }

  sendMessage({ text: input.value });
  input.value = '';
}
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-for="message in messages" :key="message.id">
      {{ message.role === 'user' ? 'User: ' : 'AI: ' }}
      {{
        message.parts
          .map(part => (part.type === 'text' ? part.text : ''))
          .join('')
      }}
    </div>

    <div v-if="status === 'submitted' || status === 'streaming'" class="mt-4">
      <button type="button" @click="stop">Stop</button>
    </div>

    <div v-if="error" class="mt-4 text-red-500">
      {{ error.message }}
    </div>

    <form @submit="handleSubmit">
      <input
        v-model="input"
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border rounded"
        placeholder="Say something..."
        :disabled="disabled"
      />
    </form>
  </div>
</template>
