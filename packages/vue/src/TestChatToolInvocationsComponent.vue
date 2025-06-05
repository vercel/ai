<script setup lang="ts">
import { getToolInvocations } from 'ai';
import { useChat } from './use-chat';

const { messages, append, addToolResult } = useChat({
  maxSteps: 5,
});
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in messages"
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
            addToolResult({
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
        append({
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        })
      "
    />
  </div>
</template>
