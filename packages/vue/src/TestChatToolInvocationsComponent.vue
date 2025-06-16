<script setup lang="ts">
import { isToolUIPart } from 'ai';
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
        v-for="(toolPart, toolIdx) in m.parts.filter(isToolUIPart)"
        :key="toolPart.toolCallId"
      >
        {{ JSON.stringify(toolPart) }}
        <button
          v-if="toolPart.state === 'input-available'"
          :data-testid="`add-result-${toolIdx}`"
          @click="
            chat.addToolResult({
              toolCallId: toolPart.toolCallId,
              output: 'test-result',
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
