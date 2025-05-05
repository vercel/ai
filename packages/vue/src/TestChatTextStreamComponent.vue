<script setup lang="ts">
import { getUIText, LanguageModelUsage } from 'ai';
import { reactive } from 'vue';
import { UIMessage, useChat } from './use-chat';

const onFinishCalls: Array<{
  message: UIMessage;
  options: {
    finishReason: string;
    usage: LanguageModelUsage;
  };
}> = reactive([]);

const { messages, append } = useChat({
  streamProtocol: 'text',
  onFinish: (message, options) => {
    onFinishCalls.push({ message, options });
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
      {{ getUIText(m.parts) }}
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
