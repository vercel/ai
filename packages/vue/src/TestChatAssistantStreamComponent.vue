<script lang="ts" setup>
import { useAssistant } from './use-assistant';

const { status, messages, append } = useAssistant({
  api: '/api/assistant'
});
</script>

<template>
  <div>
    <div data-testid="status">{{ status }}</div>
    <div v-for="(message, index) in messages" :data-testid="`message-${index}`" :key="index">
      {{ message.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ message.content }}
    </div>
    <button data-testid="do-append" @click="append({ role: 'user', content: 'hi' })" />
  </div>
</template>