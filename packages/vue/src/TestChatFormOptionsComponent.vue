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
      {{
        m.parts.map(part => (part.type === 'text' ? part.text : '')).join('')
      }}
    </div>

    <form @submit.prevent="event => handleSubmit(event)">
      <input :data-testid="`do-input`" v-model="input" type="text" />
    </form>
  </div>
</template>
