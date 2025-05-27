<script setup lang="ts">
import { computed, ref } from 'vue';
import { defaultChatStoreOptions } from 'ai';
import { UIMessage, useChat } from './use-chat';

const bodyOptions = ref<{
  chatId: string;
  messages: UIMessage[];
  [key: string]: string;
}>();

const { messages, append, status } = useChat({
  chatStore: defaultChatStoreOptions({
    api: '/api/chat',
    prepareRequestBody(options) {
      bodyOptions.value = options;
      return 'test-request-body';
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
      key="m.id"
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
          },
        )
      "
    />

    <div v-if="bodyOptions" data-testid="on-body-options">
      {{ bodyOptions }}
    </div>
  </div>
</template>
