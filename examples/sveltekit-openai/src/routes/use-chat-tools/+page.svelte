<script lang="ts">
  import { useChat } from '@ai-sdk/svelte';

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

<main class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
  {#each $messages as message (message.id)}
    <div class="whitespace-pre-wrap">
      <strong>{message.role}</strong>

      {#each message.parts as part}
        {#if part.type === 'text'}
          {part.text}
        {:else if part.type === 'tool-invocation'}
          {@const toolCallId = part.toolInvocation.toolCallId}
          {@const toolName = part.toolInvocation.toolName}
          {@const state = part.toolInvocation.state}

          {#if toolName === 'askForConfirmation'}
            {#if state === 'call'}
              <div class="text-gray-500">
                {part.toolInvocation.args.message}
                <div class="flex gap-2">
                  <button
                    class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                    on:click={() =>
                      addToolResult({ toolCallId, result: 'Yes, confirmed' })}
                    >Yes</button
                  >
                  <button
                    class="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                    on:click={() =>
                      addToolResult({ toolCallId, result: 'No, denied' })}
                    >No</button
                  >
                </div>
              </div>
            {:else if state === 'result'}
              <div class="text-gray-500">
                {part.toolInvocation.result}
              </div>
            {/if}
          {:else if toolName === 'getLocation'}
            {#if state === 'call'}
              <div class="text-gray-500">Getting location...</div>
            {:else if state === 'result'}
              <div class="text-gray-500">
                Location: {part.toolInvocation.result}
              </div>
            {/if}
          {:else if toolName === 'getWeatherInformation'}
            {#if state === 'partial-call'}
              <pre>{JSON.stringify(part.toolInvocation, null, 2)}</pre>
            {:else if state === 'call'}
              <div class="text-gray-500">
                Getting weather information for {part.toolInvocation.args
                  .city}...
              </div>
            {:else if state === 'result'}
              <div class="text-gray-500">
                Weather in {part.toolInvocation.args.city}: {part.toolInvocation
                  .result}
              </div>
            {/if}
          {/if}
        {/if}
      {/each}
    </div>
  {/each}

  <form on:submit={handleSubmit}>
    <input
      class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
      placeholder="Say something..."
      bind:value={$input}
    />
    <button type="submit">Send</button>
  </form>
</main>
