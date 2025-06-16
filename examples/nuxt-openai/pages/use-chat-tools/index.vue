<script setup lang="ts">
import { Chat } from '@ai-sdk/vue';
import { DefaultChatTransport } from 'ai';
import { computed, ref } from 'vue';

const chat = new Chat({
  // run client-side tools that are automatically executed:
  async onToolCall({ toolCall }) {
    // artificial 2 second delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (toolCall.toolName === 'getLocation') {
      const cities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco'];
      return cities[Math.floor(Math.random() * cities.length)];
    }
  },
  transport: new DefaultChatTransport({
    api: '/api/use-chat-tools',
  }),
  maxSteps: 5,
});

const messageList = computed(() => chat.messages); // computer property for type inference
const input = ref('');

const handleSubmit = (e: Event) => {
  e.preventDefault();
  chat.sendMessage({ text: input.value });
  input.value = '';
};
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
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                {{ part.toolInvocation.input.message }}
                <div className="flex gap-2">
                  <button
                    class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                    @click="
                      chat.addToolResult({
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
                      chat.addToolResult({
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
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                Location access allowed: {{ part.toolInvocation.result }}
              </div>
            </template>
          </template>

          <template v-if="part.toolInvocation.toolName === 'getLocation'">
            <template v-if="part.toolInvocation.state === 'call'">
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                Getting location...
              </div>
            </template>
            <template v-if="part.toolInvocation.state === 'result'">
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                Location: {{ part.toolInvocation.result }}
              </div>
            </template>
          </template>

          <template
            v-if="part.toolInvocation.toolName === 'getWeatherInformation'"
          >
            <template v-if="part.toolInvocation.state === 'partial-call'">
              <pre :key="part.toolInvocation.toolCallId">
                {{ JSON.stringify(part.toolInvocation, null, 2) }}
              </pre>
            </template>
            <template v-if="part.toolInvocation.state === 'call'">
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                Getting weather information for
                {{ part.toolInvocation.input.city }}...
              </div>
            </template>
            <template v-if="part.toolInvocation.state === 'result'">
              <div
                :key="part.toolInvocation.toolCallId"
                className="text-gray-500"
              >
                Weather in {{ part.toolInvocation.input.city }}:
                {{ part.toolInvocation.result }}
              </div>
            </template>
          </template>
        </template>
        <br />
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
