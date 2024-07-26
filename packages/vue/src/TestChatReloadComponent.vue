<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, append, reload } = useChat();
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

    <button
      data-testid="do-append"
      @click="append({ role: 'user', content: 'hi' })"
    />

    <button
      data-testid="do-reload"
      @click="
        reload({
          data: { 'test-data-key': 'test-data-value' },
          body: { 'request-body-key': 'request-body-value' },
          headers: { 'header-key': 'header-value' },
        })
      "
    />
  </div>
</template>
