<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, handleSubmit, input } = useChat();
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
    </div>

    <form @submit.prevent="handleSubmit">
      <input :data-testid="`do-input`" v-model="input" type="text" />
    </form>
  </div>
</template>
