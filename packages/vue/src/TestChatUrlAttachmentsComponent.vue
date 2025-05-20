<script setup lang="ts">
import { generateId } from 'ai';
import { mockId } from 'ai/test';
import { computed } from 'vue';
import { useChat } from './use-chat';

const { messages, handleSubmit, status, input } = useChat({
  chatId: generateId(),
  generateId: mockId(),
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
