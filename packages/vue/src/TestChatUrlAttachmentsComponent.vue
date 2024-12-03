<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, handleSubmit, isLoading, input } = useChat();
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
        </template>
      </template>
    </div>

    <form
      @submit="
        (event) => {
          handleSubmit(event, {
            experimental_attachments: [
              {
                name: 'test.png',
                contentType: 'image/png',
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
