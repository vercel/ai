<script setup lang="ts">
import { useAssistant } from './use-assistant';

const { status, messages, error, append, setThreadId, threadId } = useAssistant({
  api: '/api/assistant'
});
</script>

<template>
  <div>
    <div data-testid="status">{{ status }}</div>
    <div data-testid="thread-id">{{ threadId || 'undefined' }}</div>
    <div data-testid="error">{{ error?.toString() }}</div>
    <div v-for="(message, index) in messages" :data-testid="`message-${index}`" :key="index">
      {{ message.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ message.content }}
    </div>
    <button data-testid="do-append" @click="append({ role: 'user', content: 'hi' })" />
    <button data-testid="do-new-thread" @click="setThreadId(undefined)" />
    <button data-testid="do-thread-3" @click="setThreadId('t3')" />
  </div>
</template>