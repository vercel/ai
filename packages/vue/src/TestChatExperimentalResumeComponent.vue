<script setup lang="ts">
import { onMounted } from 'vue';
import { useChat } from './use-chat';

const { messages, status, experimental_resume } = useChat({
  id: '123',
  initialMessages: [{ id: 'msg_123', role: 'user', content: 'hi' }],
});

onMounted(() => {
  experimental_resume();
});
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in messages"
      :key="m.id"
      :data-testid="`message-${idx}`"
    >
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
    </div>

    <div data-testid="status">{{ status }}</div>
  </div>
</template>