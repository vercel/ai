<script setup lang="ts">
import { reactive } from 'vue';
import { TextStreamChatTransport } from 'ai';
import { UIMessage, useChat } from './use-chat';
import { createChatStore } from './chat-store';

const onFinishCalls: Array<{ message: UIMessage }> = reactive([]);

const { messages, append } = useChat({
  onFinish: options => {
    onFinishCalls.push(options);
  },
  chatStore: createChatStore({
    api: '/api/chat',
    transport: new TextStreamChatTransport({
      api: '/api/chat',
    }),
  }),
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

    <div data-testid="on-finish-calls">{{ JSON.stringify(onFinishCalls) }}</div>
  </div>
</template>
