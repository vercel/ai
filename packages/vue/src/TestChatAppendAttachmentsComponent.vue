<script setup lang="ts">
import { generateId } from 'ai';
import { mockId } from 'ai/test';
import { useChat } from './use-chat';

const { messages, append } = useChat({
  chatId: generateId(),
  generateId: mockId(),
});
</script>

<template>
  <div>
    <div data-testid="messages">{{ JSON.stringify(messages, null, 2) }}</div>

    <button
      data-testid="do-append"
      @click="
        append({
          role: 'user',
          parts: [
            {
              type: 'file',
              url: 'https://example.com/image.png',
              mediaType: 'image/png',
            },
            {
              type: 'text',
              text: 'Message with image attachment',
            },
          ],
        })
      "
    />
  </div>
</template>
