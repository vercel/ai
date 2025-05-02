<script setup lang="ts">
import { useChat } from './use-chat';
import { getToolInvocations } from 'ai';

const { messages, append, addToolResult } = useChat({
  maxSteps: 5,
});
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in messages"
      key="m.id"
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
        {{ m.content }}
      </div>
    </div>

    <button
      data-testid="do-append"
      @click="
        append({
          role: 'user',
          content: 'hi',
          parts: [{ type: 'text', text: 'hi' }],
        })
      "
    />
  </div>
</template>
