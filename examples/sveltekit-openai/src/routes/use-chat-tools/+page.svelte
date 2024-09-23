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
    }
  });
</script>

<main>
  <br />
  <ul>
      {#each $messages as message (message.id)}
          <li>{message.role}: {message.content}</li>
          {#if message.toolInvocations}
              {#each message.toolInvocations as toolInvocation (toolInvocation.toolCallId)}
                  {@const toolCallId = toolInvocation.toolCallId}

                  {#if toolInvocation.toolName === 'askForConfirmation'}
                      <div>
                          {toolInvocation.args.message}
                          <div>
                              {#if 'result' in toolInvocation}
                                  <b>{toolInvocation.result}</b>
                              {:else}
                                  <button on:click={() => addToolResult({ toolCallId, result: 'Yes' })}>Yes</button>
                                  <button on:click={() => addToolResult({ toolCallId, result: 'No' })}>No</button>
                              {/if}
                          </div>
                      </div>
                  {/if}

                  {#if 'result' in toolInvocation}
                      <div>
                          Tool call {`${toolInvocation.toolName}: `}
                          {toolInvocation.result}
                      </div>
                  {:else}
                      <div>Calling {toolInvocation.toolName}...</div>
                  {/if}
              {/each}
          {/if}
      {/each}
  </ul>
  <form on:submit={handleSubmit}>
      <input class="bg-white outline-chaplin-1 outline outline-1" bind:value={$input} />
      <button type="submit">Send</button>
  </form>
</main>
