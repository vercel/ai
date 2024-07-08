<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, handleSubmit, input } = useChat();
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="(m, idx) in messages"
      key="m.id"
      :data-testid="`message-${idx}`"
    >
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
    </div>

    <form @submit.prevent="handleSubmit">
      <input
        :data-testid="`do-input`"
        v-model="input"
        type="text"
        placeholder="Type a message..."
      />
    </form>
    
  </div>
</template>
