<script setup lang="ts">
import { mockId, mockValues } from 'ai/test';
import { useChat } from './use-chat';
import { generateId } from 'ai';

const { messages, append, reload } = useChat({
  id: generateId(),
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
          content: 'hi',
          parts: [{ text: 'hi', type: 'text' }],
        })
      "
    />

    <button
      data-testid="do-reload"
      @click="
        reload({
          data: { 'test-data-key': 'test-data-value' },
          body: { 'request-body-key': 'request-body-value' },
          headers: { 'header-key': 'header-value' },
        })
      "
    />
  </div>
</template>
