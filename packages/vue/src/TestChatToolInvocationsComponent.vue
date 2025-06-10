<script setup lang="ts">
import { getToolInvocations } from 'ai';
import { Chat } from './chat.vue';

const chat = new Chat({
  maxSteps: 5,
});
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in chat.messages"
      :key="m.id"
      :data-testid="`message-${idx}`"
    >
      <div
        v-for="(toolInvocation, toolIdx) in getToolInvocations(m)"
        :key="toolInvocation.toolCallId"
      >
        {{ JSON.stringify(toolInvocation) }}
        <button
          v-if="toolInvocation.state === 'call'"
          :data-testid="`add-result-${toolIdx}`"
          @click="
            chat.addToolResult({
              toolCallId: toolInvocation.toolCallId,
              result: 'test-result',
            })
          "
        />
      </div>
      <div :data-testid="`text-${idx}`">
        {{
          m.parts.map(part => (part.type === 'text' ? part.text : '')).join('')
        }}
      </div>
    </div>

    <button
      data-testid="do-append"
      @click="
        chat.sendMessage({
          text: 'hi',
        })
      "
    />
  </div>
</template>
