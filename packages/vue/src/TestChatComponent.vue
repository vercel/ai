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

const { messages, append, data, error, status, setData } = useChat({
  onFinish: (message, options) => {
    onFinishCalls.push({ message, options });
  },
});
</script>

<template>
  <div>
    <div data-testid="status">{{ status }}</div>
    <div data-testid="error">{{ error?.toString() }}</div>
    <div data-testid="data">{{ data != null ? JSON.stringify(data) : '' }}</div>
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

    <button data-testid="do-set-data" @click="setData([{ t1: 'set' }])" />
    <button data-testid="do-clear-data" @click="setData(undefined)" />

    <div data-testid="on-finish-calls">{{ JSON.stringify(onFinishCalls) }}</div>
  </div>
</template>
