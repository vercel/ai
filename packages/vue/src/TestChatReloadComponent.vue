<script setup lang="ts">
import { generateId } from 'ai';
import { mockId, mockValues } from 'ai/test';
import { useChat } from './use-chat';

const { messages, append, reload } = useChat({
  id: generateId(),
  generateId: mockId(),
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
      {{
        m.parts.map(part => (part.type === 'text' ? part.text : '')).join('')
      }}
    </div>

    <button
      data-testid="do-append"
      @click="
        append({
          role: 'user',
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
