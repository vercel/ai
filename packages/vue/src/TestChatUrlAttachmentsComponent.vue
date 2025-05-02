<script setup lang="ts">
import { generateId } from 'ai';
import { mockId, mockValues } from 'ai/test';
import { computed } from 'vue';
import { useChat } from './use-chat';

const { messages, handleSubmit, status, input } = useChat({
  id: generateId(),
  generateId: mockId(),
  '~internal': {
    currentDate: mockValues(new Date('2025-01-01')),
  },
});
const isLoading = computed(() => status.value !== 'ready');
</script>

<template>
  <div>
    <div data-testid="messages">{{ JSON.stringify(messages, null, 2) }}</div>

    <form
      @submit="
        event => {
          handleSubmit(event, {
            files: [
              {
                type: 'file',
                mediaType: 'image/png',
                url: 'https://example.com/image.png',
              },
            ],
          });
        }
      "
      data-testid="chat-form"
    >
      <input
        v-model="input"
        :disabled="isLoading"
        data-testid="message-input"
      />
      <button type="submit" data-testid="submit-button">Send</button>
    </form>
  </div>
</template>
