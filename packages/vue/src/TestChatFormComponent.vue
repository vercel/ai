<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, handleSubmit, input } = useChat({
  onToolCall({ toolCall }) {
    if (toolCall.toolName === 'client-tool') {
      return `test-tool-response: ${toolCall.toolName} ${
        toolCall.toolCallId
      } ${JSON.stringify(toolCall.args)}`;
    }
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

      <div v-for="invocation in m.toolInvocations" :key="invocation.toolCallId">
        <template v-if="invocation.state === 'result'">
          {{ invocation.result }}
        </template>
        <template v-else>
          {{ JSON.stringify(invocation) }}
        </template>
      </div>
    </div>

    <form @submit.prevent="handleSubmit">
      <input :data-testid="`do-input`" v-model="input" type="text" />
    </form>
  </div>
</template>
