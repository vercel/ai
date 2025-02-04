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

const messageList = computed(() => messages.value); // computer property for type inference
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="message in messageList"
      :key="message.id"
      class="whitespace-pre-wrap"
    >
      <strong>{{ `${message.role}: ` }}</strong>
      <template v-for="part in message.parts">
        <template v-if="part.type === 'text'">
          {{ part.text }}
        </template>
        <template v-else-if="part.type === 'tool-invocation'">
          <template
            v-if="part.toolInvocation.toolName === 'askForConfirmation'"
          >
            <template v-if="part.toolInvocation.state === 'call'">
              <div key="{callId}" className="text-gray-500">
                {{ part.toolInvocation.args.message }}
                <div className="flex gap-2">
                  <button
                    class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                    @click="
                      addToolResult({
                        toolCallId: part.toolInvocation.toolCallId,
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
                        toolCallId: part.toolInvocation.toolCallId,
                        result: 'No, denied',
                      })
                    "
                  >
                    No
                  </button>
                </div>
              </div>
            </template>
            <template v-if="part.toolInvocation.state === 'result'">
              <div key="{callId}" className="text-gray-500">
                Location access allowed: {{ part.toolInvocation.result }}
              </div>
            </template>
          </template>

          <template v-if="part.toolInvocation.toolName === 'getLocation'">
            <template v-if="part.toolInvocation.state === 'call'">
              Getting location...
            </template>
            <template v-if="part.toolInvocation.state === 'result'">
              Location: {{ part.toolInvocation.result }}
            </template>
          </template>

          <template
            v-if="part.toolInvocation.toolName === 'getWeatherInformation'"
          >
            <template v-if="part.toolInvocation.state === 'partial-call'">
              {{ JSON.stringify(part.toolInvocation, null, 2) }}
            </template>
            <template v-if="part.toolInvocation.state === 'call'">
              Getting weather information for
              {{ part.toolInvocation.args.city }}...
            </template>
            <template v-if="part.toolInvocation.state === 'result'">
              Weather in {{ part.toolInvocation.args.city }}:
              {{ part.toolInvocation.result }}
            </template>
          </template>
        </template>
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
