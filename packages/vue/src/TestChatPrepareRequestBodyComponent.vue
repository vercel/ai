<script setup lang="ts">
import { DefaultChatTransport } from 'ai';
import { computed, ref } from 'vue';
import { useChat } from './use-chat';

const options = ref<any>();

const { messages, append, status } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareChatRequest(optionsArg) {
      options.value = JSON.parse(JSON.stringify(optionsArg));
      return {
        body: { 'body-key': 'body-value' },
        headers: { 'header-key': 'header-value' },
      };
    },
  }),
});

const isLoading = computed(() => status.value !== 'ready');
</script>

<template>
  <div>
    <div data-testid="loading">{{ isLoading?.toString() }}</div>
    <div
      v-for="(m, idx) in messages"
      :key="m.id"
      :data-testid="`message-${idx}`"
    >
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{
        m.parts.map(part => (part.type === 'text' ? part.text : '')).join('')
      }}
    </div>

    <button
      data-testid="do-append"
      @click="
        append(
          {
            role: 'user',
            parts: [{ text: 'hi', type: 'text' }],
          },
          {
            body: { 'request-body-key': 'request-body-value' },
            headers: { 'request-header-key': 'request-header-value' },
            metadata: { 'request-metadata-key': 'request-metadata-value' },
          },
        )
      "
    />

    <div v-if="options" data-testid="on-options">
      {{ options }}
    </div>
  </div>
</template>
