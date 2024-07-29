<script setup lang="ts">
import { useChat } from './use-chat';

const onFinishCalls: Array<{
  message: Message;
  options: {
    finishReason: string;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
  };
}> = [];

const { messages, append, data, error, isLoading } = useChat({
  onFinish: (message, options) => {
    onFinishCalls.push({ message, options });
  },
});
</script>

<template>
  <div>
    <div data-testid="loading">{{ isLoading?.toString() }}</div>
    <div data-testid="error">{{ error?.toString() }}</div>
    <div data-testid="data">{{ JSON.stringify(data) }}</div>
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
      @click="append({ role: 'user', content: 'hi' })"
    />

    <div data-testid="on-finish-calls">{{ JSON.stringify(onFinishCalls) }}</div>
  </div>
</template>
