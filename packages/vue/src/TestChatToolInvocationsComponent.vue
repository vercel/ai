<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, append, addToolResult } = useChat();
</script>

<template>
  <div>
    <div
      v-for="(m, idx) in messages"
      key="m.id"
      :data-testid="`message-${idx}`"
    >
      <div
        v-for="(toolInvocation, toolIdx) in m.toolInvocations"
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
    </div>

    <button
      data-testid="do-append"
      @click="append({ role: 'user', content: 'hi' })"
    />
  </div>
</template>
