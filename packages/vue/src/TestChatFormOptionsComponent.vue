<script setup lang="ts">
import { getUIText } from 'ai';
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
      {{ getUIText(m.parts) }}
    </div>

    <form
      @submit.prevent="
        event =>
          handleSubmit(event, {
            allowEmptySubmit: true,
          })
      "
    >
      <input :data-testid="`do-input`" v-model="input" type="text" />
    </form>
  </div>
</template>
