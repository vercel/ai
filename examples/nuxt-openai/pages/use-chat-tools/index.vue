<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';

const { messages, input, error, isLoading, handleSubmit, addToolResult } = useChat({
  api: '/api/chat-with-tools',
  maxToolRoundtrips: 5,

  // run client-side tools that are automatically executed:
  async onToolCall({ toolCall }) {
    console.log('onToolCall triggered:', toolCall);
    if (toolCall.toolName === 'getLocation') {
      const cities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco'];
      const result = cities[Math.floor(Math.random() * cities.length)];
      console.log('getLocation result:', result);
      return result;
    }
  },
});

const disabled = computed(() => isLoading.value || error.value != null);
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="m in Array.isArray(messages) ? messages : []"
      :key="m.id"
      class="whitespace-pre-wrap"
    >
      <strong>{{ `${m.role}: ` }}</strong>
      {{ m.content }}
      <template v-if="m.toolInvocations">
        <div
          v-for="toolInvocation in m.toolInvocations"
          :key="toolInvocation.toolCallId"
        >
          <!-- example of pre-rendering streaming tool calls -->
          <pre v-if="toolInvocation.state === 'partial-call'">
            {{ JSON.stringify(toolInvocation, null, 2) }}
          </pre>

          <!-- render confirmation tool (client-side tool with user interaction) -->
          <div
            v-else-if="toolInvocation.toolName === 'askForConfirmation'"
            class="text-gray-500"
          >
            {{ toolInvocation.args.message }}
            <div class="flex gap-2">
              <template v-if="'result' in toolInvocation">
                <b>{{ toolInvocation.result }}</b>
              </template>
              <template v-else>
                <button
                  class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                  @click="
                    addToolResult({
                      toolCallId: toolInvocation.toolCallId,
                      result: 'Yes, confirmed.',
                    })
                  "
                >
                  Yes
                </button>
                <button
                  class="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                  @click="
                    addToolResult({
                      toolCallId: toolInvocation.toolCallId,
                      result: 'No, denied',
                    })
                  "
                >
                  No
                </button>
              </template>
            </div>
          </div>

          <!-- other tools -->
          <div
            v-else-if="'result' in toolInvocation"
            class="text-gray-500"
          >
            Tool call {{ `${toolInvocation.toolName}: ` }}
            {{ toolInvocation.result }}
          </div>
          <div
            v-else
            class="text-gray-500"
          >
            Calling {{ toolInvocation.toolName }}...
          </div>
        </div>
      </template>
      <br>
      <br>
    </div>

    <form @submit.prevent="handleSubmit">
      <input
        v-model="input"
        :disabled="disabled"
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        placeholder="Say something..."
      >
    </form>
  </div>
</template>
