<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, append, data, error, isLoading } = useChat();
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
      data-testid="button"
      @click="append({ role: 'user', content: 'hi' })"
    />
  </div>
</template>
