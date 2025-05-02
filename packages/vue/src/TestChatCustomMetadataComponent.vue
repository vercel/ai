<script setup lang="ts">
import { mockId, mockValues } from 'ai/test';
import { useChat } from './use-chat';

const { messages, append } = useChat({
  body: {
    body1: 'value1',
    body2: 'value2',
  },
  headers: {
    header1: 'value1',
    header2: 'value2',
  },
  generateId: mockId(),
  '~internal': {
    currentDate: mockValues(new Date('2025-01-01')),
  },
});
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in messages"
      key="m.id"
      :data-testid="`message-${idx}`"
    >
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
    </div>

    <button
      data-testid="do-append"
      @click="
        append({
          role: 'user',
          content: 'custom metadata component',
          parts: [{ text: 'custom metadata component', type: 'text' }],
        })
      "
    />
  </div>
</template>
