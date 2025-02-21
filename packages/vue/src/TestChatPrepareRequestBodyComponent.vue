<script setup lang="ts">
import { ref, computed } from 'vue';
import { UIMessage, useChat } from './use-chat';
import { JSONValue } from '@ai-sdk/ui-utils';

const bodyOptions = ref<{
  id: string;
  messages: UIMessage[];
  requestData?: JSONValue;
  requestBody?: object;
}>();

const { messages, append, status } = useChat({
  experimental_prepareRequestBody(options) {
    bodyOptions.value = options;
    return 'test-request-body';
  },
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
      {{ m.content }}
    </div>

    <button
      data-testid="do-append"
      @click="
        append(
          { role: 'user', content: 'hi' },
          {
            data: { 'test-data-key': 'test-data-value' },
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
