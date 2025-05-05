<script setup lang="ts">
import { mockId, mockValues } from 'ai/test';
import { useChat } from './use-chat';
import { generateId } from 'ai';

const { messages, append } = useChat({
  id: generateId(),
  generateId: mockId(),
  '~internal': {
    currentDate: mockValues(new Date('2025-01-01')),
  },
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
