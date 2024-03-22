<script setup lang="ts">
import { useChat } from 'ai/vue';
import { generateId } from 'ai';
import type { FunctionCallHandler, Message } from 'ai';

const functionCallHandler: FunctionCallHandler = async (
  chatMessages,
  functionCall,
) => {
  if (functionCall.name === 'eval_code_in_browser') {
    if (functionCall.arguments) {
      // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
      const parsedFunctionCallArguments: { code: string } = JSON.parse(
        functionCall.arguments,
      );
      // WARNING: Do NOT do this in real-world applications!
      eval(parsedFunctionCallArguments.code);
      const functionResponse = {
        messages: [
          ...chatMessages,
          {
            id: generateId(),
            name: 'eval_code_in_browser',
            role: 'function' as const,
            content: parsedFunctionCallArguments.code,
          },
        ],
      };
      return functionResponse;
    }
  }
};

const { messages, input, handleSubmit } = useChat({
  api: '/api/chat-with-functions',
  experimental_onFunctionCall: functionCallHandler,
});

// Generate a map of message role to text color
const roleToColorMap: Record<Message['role'], string> = {
  system: 'red',
  user: 'black',
  function: 'blue',
  tool: 'purple',
  assistant: 'green',
  data: 'orange',
};
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="m in messages"
      key="m.id"
      class="whitespace-pre-wrap"
      :style="{ color: roleToColorMap[m.role] }"
    >
      <strong>{{ m.role }}:</strong>
      {{ m.content || JSON.stringify(m.function_call) }}
      <br />
      <br />
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
