<script setup lang="ts">
import { generateId } from 'ai';
import { mockId } from 'ai/test';
import { computed, ref } from 'vue';
import { useChat } from './use-chat';

const { messages, handleSubmit, status, input } = useChat({
  id: generateId(),
  generateId: mockId(),
});
const files = ref<FileList>();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoading = computed(() => status.value !== 'ready');
</script>

<template>
  <div>
    <div data-testid="messages">{{ JSON.stringify(messages, null, 2) }}</div>

    <form
      @submit="
        event => {
          handleSubmit(event, { files });
          files = undefined;
          if (fileInputRef) {
            fileInputRef.value = '';
          }
        }
      "
      data-testid="chat-form"
    >
      <input
        type="file"
        @change="
          event => {
            if (event.target != null && 'files' in event.target) {
              files = event.target.files as FileList;
            }
          }
        "
        multiple
        ref="fileInputRef"
        data-testid="file-input"
      />
      <input
        v-model="input"
        :disabled="isLoading"
        data-testid="message-input"
      />
      <button type="submit" data-testid="submit-button">Send</button>
    </form>
  </div>
</template>
