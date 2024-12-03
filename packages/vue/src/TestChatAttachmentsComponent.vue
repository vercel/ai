<script setup lang="ts">
import { ref } from 'vue';
import { useChat } from './use-chat';
import { getTextFromDataUrl } from '@ai-sdk/ui-utils';

const { messages, handleSubmit, handleInputChange, isLoading, input } = useChat();
const attachments = ref<FileList>();
const fileInputRef = ref<HTMLInputElement | null>(null);
</script>

<template>
  <div>
    <div v-for="(m, idx) in messages" :key="m.id" :data-testid="`message-${idx}`">
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
      <template v-if="m.experimental_attachments">
        <template v-for="attachment in m.experimental_attachments" :key="attachment.name">
          <img
            v-if="attachment.contentType?.startsWith('image/')"
            :src="attachment.url"
            :alt="attachment.name"
            :data-testid="`attachment-${idx}`"
          />
          <div
            v-else-if="attachment.contentType?.startsWith('text/')"
            :data-testid="`attachment-${idx}`"
          >
            {{ getTextFromDataUrl(attachment.url) }}
          </div>
        </template>
      </template>
    </div>

    <form
      @submit="
        (event) => {
          handleSubmit(event, {
            allowEmptySubmit: true,
            experimental_attachments: attachments,
          });
          attachments = undefined;
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
          (event) => {
            if (event.target.files) {
              attachments = event.target.files;
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
