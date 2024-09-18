<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';

const { input, handleSubmit, messages, addToolResult } = useChat({
  api: '/api/use-chat-tools',
  maxSteps: 5,

  // run client-side tools that are automatically executed:
  async onToolCall({ toolCall }) {
    if (toolCall.toolName === 'getLocation') {
      const cities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco'];
      return cities[Math.floor(Math.random() * cities.length)];
    }
  },
});
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div v-for="m in messages" :key="m.id" class="whitespace-pre-wrap">
      <strong>{{ `${m.role}: ` }}</strong>
      {{ m.content }}
      <template
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
            <b v-if="'result' in toolInvocation">{{ toolInvocation.result }}</b>
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
        <div v-else class="text-gray-500">
          <template v-if="'result' in toolInvocation">
            Tool call {{ `${toolInvocation.toolName}: ` }}
            {{ toolInvocation.result }}
          </template>
          <template v-else> Calling {{ toolInvocation.toolName }}... </template>
        </div>
      </template>
    </div>

    <form @submit="handleSubmit">
      <input
        class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
        v-model="input"
        placeholder="Say something..."
      />
    </form>
  </div>
</template>
