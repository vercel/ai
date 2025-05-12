<script setup lang="ts">
import { reactive } from 'vue';
import { UIMessage, useChat } from './use-chat';

const onFinishCalls: Array<{ message: UIMessage }> = reactive([]);

const { messages, append, error, status } = useChat({
  onFinish: options => {
    onFinishCalls.push(options);
  },
});
</script>

<template>
  <div>
    <div data-testid="status">{{ status }}</div>
    <div data-testid="error">{{ error?.toString() }}</div>
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
